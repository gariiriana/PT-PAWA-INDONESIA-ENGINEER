package middlewares

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"pawa-report-maintenance/backend/pkg/helpers"
	"pawa-report-maintenance/backend/pkg/logger"
)

type contextKey string
const (
	RequestIDKey contextKey = "request_id"
	UserRoleKey  contextKey = "user_role"
	UserUIDKey   contextKey = "user_uid"
)

// RequestID Middleware
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			bytes := make([]byte, 16)
			rand.Read(bytes)
			reqID = hex.EncodeToString(bytes)
		}
		w.Header().Set("X-Request-ID", reqID)
		ctx := context.WithValue(r.Context(), RequestIDKey, reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Logger Middleware
func Logger(log logger.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			reqID, _ := r.Context().Value(RequestIDKey).(string)
			
			log.Info("Incoming Request", 
				"method", r.Method, 
				"path", r.URL.Path, 
				"request_id", reqID,
				"ip", r.RemoteAddr,
			)
			
			next.ServeHTTP(w, r)
			
			log.Info("Request Completed", 
				"path", r.URL.Path, 
				"request_id", reqID,
				"duration", time.Since(start).String(),
			)
		})
	}
}

// Panic Recovery Middleware
func Recovery(log logger.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					reqID, _ := r.Context().Value(RequestIDKey).(string)
					log.Error("PANIC RECOVERY CAUGHT", fmt.Errorf("%v", err), "request_id", reqID)
					helpers.WriteError(w, http.StatusInternalServerError, "Internal Server Error", reqID)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// Security Headers Middleware
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		w.Header().Set("Referrer-Policy", "no-referrer-when-downgrade")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		next.ServeHTTP(w, r)
	})
}

// CORS Middleware
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			isAllowed := false
			for _, o := range allowedOrigins {
				if o == "*" || origin == o {
					isAllowed = true
					break
				}
			}

			if isAllowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Request-ID")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Token Bucket Rate Limiter
type Limiter struct {
	mu           sync.Mutex
	tokens       float64
	capacity     float64
	rate         float64
	lastRefilled time.Time
}

func NewLimiter(capacity, rate float64) *Limiter {
	return &Limiter{
		capacity:     capacity,
		rate:         rate,
		tokens:       capacity,
		lastRefilled: time.Now(),
	}
}

func (lim *Limiter) Allow() bool {
	lim.mu.Lock()
	defer lim.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(lim.lastRefilled).Seconds()
	lim.lastRefilled = now

	lim.tokens += elapsed * lim.rate
	if lim.tokens > lim.capacity {
		lim.tokens = lim.capacity
	}

	if lim.tokens >= 1.0 {
		lim.tokens -= 1.0
		return true
	}

	return false
}

type RateLimiter struct {
	limitersMu sync.Mutex
	limiters   map[string]*Limiter
	capacity   float64
	rate       float64
}

func NewRateLimiter(capacity, rate float64) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*Limiter),
		capacity: capacity,
		rate:     rate,
	}
}

func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := strings.Split(r.RemoteAddr, ":")[0]

		rl.limitersMu.Lock()
		lim, exists := rl.limiters[ip]
		if !exists {
			lim = NewLimiter(rl.capacity, rl.rate)
			rl.limiters[ip] = lim
		}
		rl.limitersMu.Unlock()

		reqID, _ := r.Context().Value(RequestIDKey).(string)
		if !lim.Allow() {
			helpers.WriteError(w, http.StatusTooManyRequests, "Too many requests. Please try again later.", reqID)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Auth Middleware (Firebase JWT Verification stub with developer fallback)
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID, _ := r.Context().Value(RequestIDKey).(string)
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			helpers.WriteError(w, http.StatusUnauthorized, "Missing or invalid authorization header.", reqID)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		
		// In a full production implementation, use firebase admin SDK to verify the token:
		// token, err := firestoreClient.VerifyIDToken(r.Context(), token)
		// For this boilerplate helper, we accept mock tokens or debug signatures
		switch token {
		case "mock-engineer-token":
			ctx := context.WithValue(r.Context(), UserUIDKey, "mock-eng-123")
			ctx = context.WithValue(ctx, UserRoleKey, "engineer")
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		case "mock-hse-token":
			ctx := context.WithValue(r.Context(), UserUIDKey, "mock-hse-123")
			ctx = context.WithValue(ctx, UserRoleKey, "hse")
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Parse token structure for basic validation fallback
		parts := strings.Split(token, ".")
		if len(parts) != 3 {
			helpers.WriteError(w, http.StatusUnauthorized, "Invalid Bearer Token format.", reqID)
			return
		}

		// Inject mock context variables for test request
		ctx := context.WithValue(r.Context(), UserUIDKey, "firebase-user-uid")
		ctx = context.WithValue(ctx, UserRoleKey, "engineer")
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
