#!/usr/bin/env ruby
# frozen_string_literal: true

# Probes known Modbus devices and attempts to identify them by reading
# the Product ID register (0x00F7) and other distinguishing registers.
#
# Usage: bundle exec ruby script/modbus_identify.rb [/dev/cu.usbserialXXX] [addr1,addr2,...]

require "bundler/setup"
require "rmodbus"

KNOWN_PRODUCTS = {
  2608 => "NT48A08 — 8Ch NTC temperature acquisition",
  2620 => "NT48B20 — 20Ch NTC temperature acquisition",
  2632 => "NT48C32 — 32Ch NTC temperature acquisition",
}.freeze

BAUD_RATES = {
  0 => 1200, 1 => 2400, 2 => 4800, 3 => 9600,
  4 => 19200, 5 => 38400, 6 => 57600, 7 => 115200,
}.freeze

PARITY = { 0 => "None", 1 => "Even", 2 => "Odd" }.freeze

port = ARGV[0] || Dir.glob("/dev/cu.usbserial-*").first || abort("No USB serial port found")
addresses = if ARGV[1]
              ARGV[1].split(",").map(&:to_i)
            else
              # Default: scan 1-10 for quick results
              (1..10).to_a
            end

puts "Port: #{port}"
puts "Probing addresses: #{addresses.join(", ")}"
puts

ModBus::RTUClient.connect(port, 9600) do |client|
  client.read_retry_timeout = 0.3
  client.read_retries = 1

  addresses.each do |addr|
    slave = client.with_slave(addr)

    # First check if anything responds at all
    begin
      slave.holding_registers[0]
    rescue ModBus::Errors::ModBusTimeout
      next
    rescue ModBus::Errors::ModBusException
      # Device present but register 0 may not be readable — continue probing
    end

    puts "=== Address #{addr} ==="

    # Product ID (0x00F7 = 247)
    begin
      product_id = slave.holding_registers[0x00F7]
      name = KNOWN_PRODUCTS[product_id] || "Unknown (ID: #{product_id})"
      puts "  Product ID:  #{product_id} — #{name}"
    rescue ModBus::Errors::ModBusTimeout
      puts "  Product ID:  (no response)"
    rescue ModBus::Errors::ModBusException => e
      puts "  Product ID:  (exception: #{e.message})"
    end

    # RS485 address register (0x00FD = 253)
    begin
      stored_addr = slave.holding_registers[0x00FD]
      puts "  Stored addr: #{stored_addr}"
    rescue StandardError
    end

    # Baud rate (0x00FE = 254)
    begin
      baud_code = slave.holding_registers[0x00FE]
      baud = BAUD_RATES[baud_code] || "unknown(#{baud_code})"
      puts "  Baud rate:   #{baud}"
    rescue StandardError
    end

    # Parity (0x00FF = 255)
    begin
      parity_code = slave.holding_registers[0x00FF]
      parity = PARITY[parity_code] || "unknown(#{parity_code})"
      puts "  Parity:      #{parity}"
    rescue StandardError
    end

    # Try reading input registers (FC 04) at 0x0000 — temperature/analog data
    begin
      values = slave.input_registers[0..3]
      puts "  Input regs [0..3]: #{values.inspect}"
    rescue ModBus::Errors::ModBusTimeout
      puts "  Input regs [0..3]: (no response)"
    rescue ModBus::Errors::ModBusException => e
      puts "  Input regs [0..3]: (exception: #{e.message})"
    end

    # Try reading holding registers at 0x00A0 — DS18B20/NTC temp values mapped here
    begin
      values = slave.holding_registers[0x00A0..0x00A3]
      puts "  Hold regs [0xA0..0xA3]: #{values.inspect}"
    rescue ModBus::Errors::ModBusTimeout
      puts "  Hold regs [0xA0..0xA3]: (no response)"
    rescue ModBus::Errors::ModBusException => e
      puts "  Hold regs [0xA0..0xA3]: (exception: #{e.message})"
    end

    puts
  end
end
