require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module PlcController
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    #
    # poller.rb is a script (run via `bin/rails runner lib/poller.rb`), not an
    # autoloadable class file — its top-level `loop do` would otherwise run
    # during eager loading and hang application boot indefinitely.
    config.autoload_lib(ignore: %w[assets tasks poller.rb])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # Autoload app/apis so RestfulApi subclasses are available without explicit requires
    config.autoload_paths << Rails.root.join("app/apis")
    config.autoload_paths << Rails.root.join("app/drivers")
  end
end
