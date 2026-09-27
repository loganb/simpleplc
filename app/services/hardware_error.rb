class HardwareError < StandardError
  attr_reader :code, :details, :status
  def initialize(message, code: "conflict", details: {}, status: :conflict)
    super(message)
    @code, @details, @status = code, details, status
  end
end
