class DriversController < ApplicationController
  def index
    drivers = Drivers::Registry.metadata
    render json: { drivers: drivers, query: drivers.map { |d| d[:id] } }
  end

  def show
    driver = Drivers::Registry.metadata.find { |d| d[:id] == params[:id] }
    return render json: {}, status: :not_found unless driver

    render json: { drivers: [ driver ] }
  end
end
