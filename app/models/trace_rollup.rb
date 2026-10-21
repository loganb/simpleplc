# One-minute summary of an instance's traces; see Logic::TraceRollupBuilder.
class TraceRollup < ApplicationRecord
  belongs_to :logic_instance

  BUCKET = 1.minute
end
