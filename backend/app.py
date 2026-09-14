from extensions import app
from db import init_db
from routes.wifi_routes import wifi_bp
from routes.charities_routes import charities_bp
from routes.stats_routes import stats_bp
from routes.refresh_routes import refresh_bp
from routes.spa_routes import spa_bp
from routes.directions_routes import directions_bp
from services.refresh_service import maybe_refresh_on_startup

init_db()
maybe_refresh_on_startup()

app.register_blueprint(wifi_bp)
app.register_blueprint(charities_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(refresh_bp)
app.register_blueprint(spa_bp)
app.register_blueprint(directions_bp)

#  Start server

if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
