class DevicesController < ApplicationController
  include RestfulApiController

  def impact
    render json: HardwareConfiguration.impact([ Device.find(params[:id]).id ])
  end
end
