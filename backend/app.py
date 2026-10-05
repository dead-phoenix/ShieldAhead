from extensions import app
from db import init_db
from routes.wifi_routes import wifi_bp
from routes.charities_routes import charities_bp
from routes.facilities_routes import facilities_bp
from routes.stats_routes import stats_bp
from routes.refresh_routes import refresh_bp
from routes.spa_routes import spa_bp
from routes.directions_routes import directions_bp
from routes.helplines_routes import helplines_bp
from routes.locations_routes import locations_bp
from routes.voice_routes import voice_bp
from services.refresh_service import maybe_refresh_on_startup

init_db()
maybe_refresh_on_startup() # checks refresh timestamps and refreshes if needed

app.register_blueprint(wifi_bp)
app.register_blueprint(charities_bp)
app.register_blueprint(facilities_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(refresh_bp)
app.register_blueprint(spa_bp)
app.register_blueprint(directions_bp)
app.register_blueprint(helplines_bp)
app.register_blueprint(locations_bp)
app.register_blueprint(voice_bp)

#  Start server

if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
