from flask import Flask
from flask_cors import CORS
from database import init_database
from api.routes import api

app = Flask(__name__)
CORS(app)

# Initialize database
init_database()

# Register blueprints
app.register_blueprint(api, url_prefix='/api')

if __name__ == '__main__':
    print('Starting Reference Manager API on http://localhost:5000')
    app.run(host='localhost', port=5000, debug=True)
