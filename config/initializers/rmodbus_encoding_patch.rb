# Ruby 4.0 enforces encoding on IO#write. rmodbus builds binary PDU strings
# without explicitly setting ASCII-8BIT encoding, causing an
# Encoding::UndefinedConversionError on write. Force binary encoding before write.
module ModBus
  class RTUSlave < Client::Slave
    private

    def send_pdu(pdu)
      msg = @uid.chr + pdu
      msg << [crc16(msg)].pack("S<")

      clean_input_buff
      @io.binmode if @io.respond_to?(:binmode)
      @io.write msg.b   # .b forces ASCII-8BIT / binary encoding

      log "Tx (#{msg.size} bytes): " + logging_bytes(msg)
    end
  end
end
