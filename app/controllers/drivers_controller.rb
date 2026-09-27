class DriversController < ApplicationController
  def index
    drivers = Drivers::Registry.metadata
    render json: { drivers: drivers, query: drivers.map { |d| d[:id] } }
  end
end
