# Live results of an instance's latest evaluation: block state for the next
# tick and the values bindings read. Updated in place by the evaluator while
# it holds this row's lock (LogicInstance#lock_state!); deliberately no
# lock_version or change notifications, so it can change every second without
# touching the instance.
class LogicInstanceState < ApplicationRecord
  include HasResults

  belongs_to :logic_instance
end
