# Seed the known RS-485 hardware on the USB serial adapter.
# Idempotent — safe to run multiple times.

iface = HostInterface.find_or_create_by!(port: "/dev/cu.usbserial-D30E7F3F") do |i|
  i.baud_rate = 9600
  i.data_bits = 8
  i.stop_bits = 1
  i.parity    = "none"
end

[
  { modbus_address: 1, name: "DS18B20 Temperature Board", driver: "Drivers::N4DSC08" },
  { modbus_address: 2, name: "NTC Temperature Board",     driver: "Drivers::NT48C32" },
  { modbus_address: 3, name: "Relay I/O Board",           driver: "Drivers::N4D8B08" },
].each do |attrs|
  Device.find_or_create_by!(host_interface: iface, modbus_address: attrs[:modbus_address]) do |d|
    d.name   = attrs[:name]
    d.driver = attrs[:driver]
  end
end

puts "Seeded 1 HostInterface, #{Device.count} Devices"
