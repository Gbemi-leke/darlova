from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

admin.site.site_header = "Darlova — Admin Panel"
admin.site.site_title = "Darlova Admin"
admin.site.index_title = "Darlova Dashboard"

urlpatterns = [
    path("", include("frontend.urls")),   # public site + login / register
    path("", include("backend.urls")),    # member dashboard
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    # In development Django serves uploaded photos itself.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # On shared hosting there is no separate file server, so Django serves
    # uploaded photos too. Fine for launch; move photos to cloud storage as you grow.
    urlpatterns += [re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT})]

# Custom "page not found" page (shown when DEBUG = False)
handler404 = "frontend.views.page_not_found"
