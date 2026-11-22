"""
Start file for cPanel "Setup Python App" (Phusion Passenger).
Passenger looks for a callable named `application` in this file.
"""
import os
import sys

# Make sure the project folder (where manage.py lives) is on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "darlova.settings")

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
