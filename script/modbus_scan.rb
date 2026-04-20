#!/usr/bin/env ruby
# frozen_string_literal: true

# Scans for Modbus RTU devices on a USB serial port.
# Iterates through addresses 1-247 and reports which ones respond.
#
# Usage: bundle exec ruby script/modbus_scan.rb [/dev/cu.usbserialXXX]

require "bundler/setup"
require "rmodbus"

# --- Find the serial port ---

def find_usb_serial_port
  # cu.* devices are the "call-up" (non-blocking) variants on macOS — preferred for scripts
  candidates = Dir.glob("/dev/cu.usbserial-*") + Dir.glob("/dev/cu.usbmodem*")
  candidates.sort
end

port = ARGV[0]

unless port
  candidates = find_usb_serial_port
  if candidates.empty?
    abort "No USB serial ports found. Is the adapter plugged in?"
  elsif candidates.size == 1
    port = candidates.first
  else
    puts "Multiple USB serial ports found:"
    candidates.each_with_index { |c, i| puts "  #{i + 1}) #{c}" }
    print "Select port number [1]: "
    choice = $stdin.gets.to_i
    choice = 1 if choice == 0
    port = candidates[choice - 1] || abort("Invalid selection")
  end
end

puts "Using serial port: #{port}"
puts "Settings: 9600-N-8-1"
puts "Scanning Modbus addresses 1-247..."
puts

# --- Scan ---

found = []

ModBus::RTUClient.connect(port, 9600) do |client|
  client.read_retry_timeout = 0.2  # 200ms timeout — enough for RTU at 9600 baud
  client.read_retries = 1

  (1..247).each do |addr|
    print "\rScanning address #{addr}/247..."
    $stdout.flush

    begin
      slave = client.with_slave(addr)
      # Try reading a single holding register at address 0 — the most
      # universally supported function (FC 03). Even devices that don't
      # use holding registers will typically respond with an exception
      # frame rather than silence, which still confirms presence.
      slave.holding_registers[0]
      found << { address: addr, status: "OK" }
    rescue ModBus::Errors::ModBusTimeout
      # No response — no device at this address
      next
    rescue ModBus::Errors::ModBusException => e
      # Device responded with an exception (illegal function, illegal address, etc.)
      # This still means a device is present at this address.
      found << { address: addr, status: "Exception: #{e.message}" }
    end
  end
end

puts "\r#{" " * 40}"  # clear the progress line
puts

if found.empty?
  puts "No Modbus devices found."
  puts
  puts "Troubleshooting:"
  puts "  - Check RS-485 wiring (A/B lines, ground)"
  puts "  - Verify baud rate matches device configuration"
  puts "  - Ensure the USB adapter is the correct port"
else
  puts "Found #{found.size} device(s):"
  puts
  found.each do |dev|
    puts "  Address %3d — %s" % [dev[:address], dev[:status]]
  end
end
