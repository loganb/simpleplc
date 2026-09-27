class HostInterfacesController < ApplicationController
  include RestfulApiController

  def scan
    bus = HostInterface.find(params[:id])
    options = params.fetch(:options, ActionController::Parameters.new)
    raise HardwareError.new("Scan options must be an object", status: :unprocessable_entity) unless options.is_a?(ActionController::Parameters)
    HardwareScan.request(bus, params[:request_id], options.permit(:first_address, :last_address, profiles: [ :baud_rate, :data_bits, :stop_bits, :parity ]).to_h)
    render json: serialize_flat([ bus ]), status: :accepted
  end

  def cancel_scan
    bus = HostInterface.find(params[:id])
    HardwareScan.cancel(bus, params[:request_id])
    render json: serialize_flat([ bus ])
  end

  def impact
    render json: HardwareConfiguration.impact(HostInterface.find(params[:id]).devices.pluck(:id))
  end

  def preview
    bus = HostInterface.find(params[:id])
    render json: HardwareConfiguration.new(bus, reconciliation_params).execute
  end

  def apply
    bus = HostInterface.find(params[:id])
    result = HardwareConfiguration.new(bus, reconciliation_params).execute(apply: true)
    render json: serialize_flat([ bus.reload ] + bus.devices.to_a).merge(deleted_ids: result["deleted_ids"],
      invalidates: { Device: :queries, HostInterface: :queries }, result: result)
  end

  private

  def reconciliation_params
    params.permit(:configuration_revision, :request_id, devices: [ :id, :name, :driver, :modbus_address, :scan_request_id, :profile_index ]).to_h
  end
end
