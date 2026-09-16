from extensions import app
from db import init_db
from routes.wifi_routes import wifi_bp
from routes.charities_routes import charities_bp
from routes.stats_routes import stats_bp
from routes.refresh_routes import refresh_bp
from routes.spa_routes import spa_bp
from routes.directions_routes import directions_bp
from routes.helplines_routes import helplines_bp
from services.refresh_service import maybe_refresh_on_startup
from services.crisis_content_service import seed_static_crisis_content

init_db()
seed_static_crisis_content() # loads data/helplines.json + data/pre_crisis_checklist.json into Postgres
maybe_refresh_on_startup() # checks refresh timestamps and refreshes if needed

app.register_blueprint(wifi_bp)
app.register_blueprint(charities_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(refresh_bp)
app.register_blueprint(spa_bp)
app.register_blueprint(directions_bp)
app.register_blueprint(helplines_bp)

#  Start server

if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
