module Logic
  class EvaluationContext
    def self.empty
      new
    end

    def initialize(logic_diagram: nil)
      @logic_diagram = logic_diagram
    end

    def identifier_value(name)
      block = logic_diagram&.logic_blocks&.find_by(name: name)
      measurement = Measurement.find_by(name: name)

      raise Expression::Error, "ambiguous reference #{name}" if block && measurement
      return block.latest_datum&.value if block
      return measurement.latest_datum&.value if measurement

      raise Expression::Error, "unknown name #{name}"
    end

    private

    attr_reader :logic_diagram
  end
end
