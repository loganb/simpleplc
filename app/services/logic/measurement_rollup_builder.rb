module Logic
  module MeasurementRollupBuilder
    module_function

    def build(values)
      stats = { "null_count" => values.count(&:nil?) }
      numbers = values.select { |value| value.is_a?(Numeric) }
      booleans = values.select { |value| value == true || value == false }

      if numbers.any?
        stats["number"] = {
          "min" => numbers.min,
          "max" => numbers.max,
          "mean" => numbers.sum.fdiv(numbers.size),
          "first" => numbers.first,
          "last" => numbers.last,
          "count" => numbers.size
        }
      end
      if booleans.any?
        stats["boolean"] = {
          "true_fraction" => booleans.count(true).fdiv(booleans.size),
          "true_count" => booleans.count(true),
          "transitions" => booleans.each_cons(2).count { |a, b| a != b },
          "first" => booleans.first,
          "last" => booleans.last,
          "count" => booleans.size
        }
      end
      stats
    end
  end
end
