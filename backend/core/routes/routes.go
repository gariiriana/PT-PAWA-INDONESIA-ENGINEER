package routes

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
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

	mux.HandleFunc("/api/verify-turnstile", func(w http.ResponseWriter, r *http.Request) {
		reqID, _ := r.Context().Value(middlewares.RequestIDKey).(string)
		if r.Method != http.MethodPost {
			helpers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed", reqID)
			return
		}

		var req struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			helpers.WriteError(w, http.StatusBadRequest, "Invalid request body", reqID)
			return
		}

		if req.Token == "" {
			helpers.WriteError(w, http.StatusBadRequest, "Token is required", reqID)
			return
		}

		// Cloudflare Turnstile Verification API
		secretKey := os.Getenv("CLOUDFLARE_TURNSTILE_SECRET_KEY")
		if secretKey == "" {
			secretKey = "0x4AAAAAADoDDv7O5TuiUJtHg-tPdv_ToMQ" // Real secret key fallback
		}

		resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
			"secret":   {secretKey},
			"response": {req.Token},
			"remoteip": {r.RemoteAddr},
		})
		if err != nil {
			log.Error("Cloudflare verification request failed", err)
			helpers.WriteError(w, http.StatusInternalServerError, "Failed to verify Turnstile token", reqID)
			return
		}
		defer resp.Body.Close()

		var cfResp struct {
			Success    bool     `json:"success"`
			ErrorCodes []string `json:"error-codes"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
			log.Error("Failed to decode Cloudflare response", err)
			helpers.WriteError(w, http.StatusInternalServerError, "Failed to decode Turnstile response", reqID)
			return
		}

		if !cfResp.Success {
			log.Info("Turnstile verification failed", "error-codes", cfResp.ErrorCodes)
			helpers.WriteJSON(w, http.StatusOK, false, "Turnstile token verification failed", cfResp.ErrorCodes, reqID)
			return
		}

		helpers.WriteJSON(w, http.StatusOK, true, "Turnstile token verified successfully", nil, reqID)
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
		"https://localhost:3000", // Engineer Portal (HTTPS)
		"https://localhost:3001", // HSE Portal (HTTPS)
		"https://pt-pawa-indonesia-engineer-report.com",
		"https://www.pt-pawa-indonesia-engineer-report.com",
		"https://pt-pawa-indonesia-hse-report.com",
		"https://www.pt-pawa-indonesia-hse-report.com",
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
