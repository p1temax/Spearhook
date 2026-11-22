package utils

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestShouldRenderClone(t *testing.T) {
	if !ShouldRenderClone("http://example.com/#/login?_key=1", `<html><body>shell</body></html>`) {
		t.Fatal("fragment URL should render")
	}
	if ShouldRenderClone("http://example.com/", `<html><body><div id="root"></div></body></html>`) != true {
		t.Fatal("root SPA shell should render")
	}
	if ShouldRenderClone("http://example.com/", `<html><body><img src="x"></body></html>`) {
		t.Fatal("plain page should stay static")
	}
	if ShouldRenderClone("http://example.com/qr.png", QRCodePageHTML()) {
		t.Fatal("direct QR page must stay static")
	}
}

func TestFetchURLHTMLRenderedReplacesQRCanvas(t *testing.T) {
	if chromeExecPath() == "" {
		t.Skip("no Chrome/Chromium available")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html><html><body>
<div id="root"><div class="e9login-QRCode-area"><canvas class="qrcode" width="180" height="180"></canvas></div></div>
<script>document.querySelector('canvas').getContext('2d').fillRect(0,0,10,10);</script>
</body></html>`))
	}))
	defer srv.Close()

	htmlText, _, err := FetchURLHTMLRendered(context.Background(), srv.URL, 60*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(htmlText, PlaceholderQRRelayURL) {
		t.Fatalf("QR placeholder missing: %s", htmlText)
	}
	if strings.Contains(strings.ToLower(htmlText), "<canvas") {
		t.Fatalf("canvas should be replaced: %s", htmlText)
	}
	if strings.Contains(strings.ToLower(htmlText), "<script") {
		t.Fatalf("scripts should be removed: %s", htmlText)
	}
}

func TestStripHeavyBase64PreservesScreenshotPage(t *testing.T) {
	page := `<img src="data:image/jpeg;base64,AAAA"><img src="{{QR_RELAY_URL}}">` + qrScreenshotMarker
	out := StripHeavyBase64DataURIs(page)
	if !strings.Contains(out, "data:image/jpeg;base64,AAAA") {
		t.Fatalf("screenshot background was stripped: %s", out)
	}
}
