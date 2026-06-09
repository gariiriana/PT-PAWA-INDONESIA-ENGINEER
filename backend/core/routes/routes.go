package routes

import (
	"net/http"
	"time"

	"pawa-report-maintenance/backend/core/middlewares"
	"pawa-report-maintenance/backend/pkg/helpers"
	"pawa-report-maintenance/backend/pkg/logger"
)

// RegisterRoutes sets up the API mux and applies the full middleware chain.
func RegisterRoutes(log logger.Logger) http.Handler {
	mux := http.NewServeMux()

	// ──── Public Endpoints ────────────────────────────────────────────
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		reqID, _ := r.Context().Value(middlewares.RequestIDKey).(string)
		helpers.WriteJSON(w, http.StatusOK, true, "PT PAWA Backend Helper API - Healthy", map[string]string{
			"status":    "running",
			"timestamp": time.Now().Format(time.RFC3339),
		}, reqID)
	})

	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) {
		reqID, _ := r.Context().Value(middlewares.RequestIDKey).(string)
		helpers.WriteJSON(w, http.StatusOK, true, "Version Info", map[string]string{
			"version": "1.0.0-boilerplate",
			"go":      "1.23",
		}, reqID)
	})

	// ──── Protected Endpoints (requires Bearer token) ─────────────────
	mux.Handle("/api/export-summary", middlewares.Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID, _ := r.Context().Value(middlewares.RequestIDKey).(string)
		role, _ := r.Context().Value(middlewares.UserRoleKey).(string)
		uid, _ := r.Context().Value(middlewares.UserUIDKey).(string)

		helpers.WriteJSON(w, http.StatusOK, true, "Summary Export Authorized", map[string]interface{}{
			"uid":     uid,
			"role":    role,
			"message": "Arsip data siap diolah oleh service server-side Go.",
		}, reqID)
	})))

	// ──── Middleware Chain (outermost first) ───────────────────────────
	allowedOrigins := []string{
		"http://localhost:3000", // Engineer Portal
		"http://localhost:3001", // HSE Portal
	}

	limiter := middlewares.NewRateLimiter(20.0, 10.0) // 20 capacity, refill 10/sec

	var handler http.Handler = mux
	handler = limiter.Limit(handler)
	handler = middlewares.CORS(allowedOrigins)(handler)
	handler = middlewares.SecurityHeaders(handler)
	handler = middlewares.Logger(log)(handler)
	handler = middlewares.RequestID(handler)
	handler = middlewares.Recovery(log)(handler)

	return handler
}
