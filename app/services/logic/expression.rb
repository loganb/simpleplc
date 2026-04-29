require "strscan"

module Logic
  class Expression
    class Error < StandardError; end

    Token = Struct.new(:type, :value, keyword_init: true)

    PRECEDENCE = {
      "||" => 1,
      "&&" => 2,
      "==" => 3, "!=" => 3,
      "<" => 4, "<=" => 4, ">" => 4, ">=" => 4,
      "+" => 5, "-" => 5,
      "*" => 6, "/" => 6
    }.freeze

    def self.evaluate(source, context:)
      new(source, context: context).evaluate
    end

    def self.references(source)
      parser = new(source, context: EvaluationContext.empty)
      parser.parse
      parser.references
    end

    attr_reader :references

    def initialize(source, context:)
      @tokens = tokenize(source)
      @position = 0
      @context = context
      @references = { identifiers: [] }
    end

    def evaluate
      ast = parse
      evaluate_node(ast)
    end

    def parse
      node = parse_expression
      raise Error, "unexpected token #{peek.value}" if peek
      node
    end

    private

    def tokenize(source)
      tokens = []
      scanner = StringScanner.new(source.to_s)
      until scanner.eos?
        scanner.scan(/\s+/) && next
        if scanner.scan(/\d+(?:\.\d+)?/)
          tokens << Token.new(type: :number, value: scanner.matched.to_f)
        elsif scanner.scan(/true|false/i)
          tokens << Token.new(type: :boolean, value: scanner.matched.downcase == "true")
        elsif scanner.scan(/nil|null/i)
          tokens << Token.new(type: :nil, value: nil)
        elsif scanner.scan(/[A-Za-z_]\w*/)
          tokens << Token.new(type: :identifier, value: scanner.matched)
        elsif scanner.scan(/&&|\|\||==|!=|<=|>=|[+\-*\/()!<>]/)
          tokens << Token.new(type: :operator, value: scanner.matched)
        else
          raise Error, "unexpected token near #{scanner.rest.inspect}"
        end
      end
      tokens
    end

    def parse_expression(min_precedence = 1)
      left = parse_unary

      while peek&.type == :operator && PRECEDENCE.fetch(peek.value, 0) >= min_precedence
        operator = advance.value
        right = parse_expression(PRECEDENCE.fetch(operator) + 1)
        left = [ :binary, operator, left, right ]
      end

      left
    end

    def parse_unary
      if peek&.type == :operator && %w[! -].include?(peek.value)
        operator = advance.value
        return [ :unary, operator, parse_unary ]
      end

      parse_primary
    end

    def parse_primary
      token = advance
      raise Error, "unexpected end of expression" unless token

      case token.type
      when :number, :boolean, :nil
        [ :literal, token.value ]
      when :identifier
        references[:identifiers] |= [ token.value ]
        [ :identifier, token.value ]
      when :operator
        if token.value == "("
          node = parse_expression
          closing = advance
          raise Error, "expected closing parenthesis" unless closing&.value == ")"
          node
        else
          raise Error, "unexpected operator #{token.value}"
        end
      else
        raise Error, "unexpected token #{token.value}"
      end
    end

    def evaluate_node(node)
      case node[0]
      when :literal
        node[1]
      when :identifier
        context.identifier_value(node[1])
      when :unary
        evaluate_unary(node[1], evaluate_node(node[2]))
      when :binary
        evaluate_binary(node[1], evaluate_node(node[2]), evaluate_node(node[3]))
      end
    end

    def evaluate_unary(operator, value)
      case operator
      when "!" then !truthy?(value)
      when "-" then -numeric(value)
      end
    end

    def evaluate_binary(operator, left, right)
      case operator
      when "||" then truthy?(left) || truthy?(right)
      when "&&" then truthy?(left) && truthy?(right)
      when "==" then left == right
      when "!=" then left != right
      when "<" then numeric(left) < numeric(right)
      when "<=" then numeric(left) <= numeric(right)
      when ">" then numeric(left) > numeric(right)
      when ">=" then numeric(left) >= numeric(right)
      when "+" then numeric(left) + numeric(right)
      when "-" then numeric(left) - numeric(right)
      when "*" then numeric(left) * numeric(right)
      when "/" then numeric(left) / numeric(right)
      end
    end

    def truthy?(value)
      value != nil && value != false && value != 0
    end

    def numeric(value)
      return value.to_f if value.is_a?(Numeric)
      return 1.0 if value == true
      return 0.0 if value == false || value.nil?
      raise Error, "expected numeric value"
    end

    def context
      @context
    end

    def peek
      @tokens[@position]
    end

    def advance
      token = peek
      @position += 1 if token
      token
    end
  end
end
