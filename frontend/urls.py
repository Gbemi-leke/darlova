from django.urls import path

from . import pwa, views

urlpatterns = [
    path("", views.home, name="home"),
    path("premium/", views.premium, name="premium"),
    path("safety/", views.safety, name="safety"),

    # Accounts
    path("login/", views.login_view, name="login"),
    path("register/", views.register_view, name="register"),
    path("logout/", views.logout_view, name="logout"),
    path("forgot-password/", views.forgot_password, name="forgot_password"),

    # Installable app (Add to Home Screen)
    path("manifest.webmanifest", pwa.manifest, name="manifest"),
    path("sw.js", pwa.service_worker, name="service_worker"),
    path("offline/", pwa.offline, name="offline"),
    path("healthz/", pwa.healthz, name="healthz"),
    path("api/password/request/", views.reset_request, name="reset_request"),
    path("api/password/verify/", views.reset_verify, name="reset_verify"),
    path("api/password/reset/", views.reset_password, name="reset_password"),
]
