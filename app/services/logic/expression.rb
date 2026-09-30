require "strscan"

module Logic
  class Expression
    class Error < StandardError; end

    Token = Struct.new(:type, :value, keyword_init: true)

    PRECEDENCE = {
      "??" => 1,
      "||" => 2,
      "&&" => 3,
      "==" => 4, "!=" => 4, "===" => 4, "!==" => 4,
      "<" => 5, "<=" => 5, ">" => 5, ">=" => 5,
      "+" => 6, "-" => 6,
      "*" => 7, "/" => 7
    }.freeze
    FUNCTIONS = %w[coalesce].freeze

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
        elsif scanner.scan(/(?:true|false)\b/i)
          tokens << Token.new(type: :boolean, value: scanner.matched.downcase == "true")
        elsif scanner.scan(/(?:nil|null)\b/i)
          tokens << Token.new(type: :nil, value: nil)
        elsif scanner.scan(/[A-Za-z_]\w*/)
          tokens << Token.new(type: :identifier, value: scanner.matched)
        elsif scanner.scan(/&&|\|\||\?\?|===|!==|==|!=|<=|>=|[+\-*\/()!<>,]/)
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
        return parse_call(token.value) if peek&.type == :operator && peek.value == "("

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

    def parse_call(name)
      function = name.downcase
      raise Error, "unknown function #{name}" unless FUNCTIONS.include?(function)

      advance
      arguments = [ parse_expression ]
      while peek&.value == ","
        advance
        arguments << parse_expression
      end
      raise Error, "expected closing parenthesis" unless advance&.value == ")"

      [ :call, function, arguments ]
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
        return evaluate_coalesce(node[2..3]) if node[1] == "??"

        evaluate_binary(node[1], evaluate_node(node[2]), evaluate_node(node[3]))
      when :call
        evaluate_coalesce(node[2])
      end
    end

    def evaluate_coalesce(nodes)
      nodes.each do |argument|
        value = evaluate_node(argument)
        return value unless value.nil?
      end
      nil
    end

    def evaluate_unary(operator, value)
      return nil if value.nil?

      case operator
      when "!" then !boolean(value)
      when "-" then -numeric(value)
      end
    end

    def evaluate_binary(operator, left, right)
      return left == right if operator == "==="
      return left != right if operator == "!=="
      return logical_and(left, right) if operator == "&&"
      return logical_or(left, right) if operator == "||"
      return nil if left.nil? || right.nil?

      case operator
      when "==" then comparable(left) == comparable(right)
      when "!=" then comparable(left) != comparable(right)
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

    # SQL three-valued logic: null is "unknown", so a known false (for &&) or
    # a known true (for ||) decides the result on its own.
    def logical_and(left, right)
      left = boolean(left) unless left.nil?
      right = boolean(right) unless right.nil?
      return false if left == false || right == false
      return nil if left.nil? || right.nil?

      true
    end

    def logical_or(left, right)
      left = boolean(left) unless left.nil?
      right = boolean(right) unless right.nil?
      return true if left == true || right == true
      return nil if left.nil? || right.nil?

      false
    end

    def boolean(value)
      return value if value == true || value == false
      return value != 0 if value.is_a?(Numeric)
      raise Error, "expected boolean value"
    end

    def numeric(value)
      return value.to_f if value.is_a?(Numeric)
      return 1.0 if value == true
      return 0.0 if value == false
      raise Error, "expected numeric value"
    end

    def comparable(value)
      return numeric(value) if value.is_a?(Numeric) || value == true || value == false
      value
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
