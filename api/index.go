package handler

import (
	"net/http"
	"pawa-report-maintenance/backend/core/routes"
	"pawa-report-maintenance/backend/pkg/logger"
)

var appHandler http.Handler

func init() {
	log := logger.NewSimpleLogger()
	appHandler = routes.RegisterRoutes(log)
}

// Handler is the serverless entrypoint for Vercel Go SDK
func Handler(w http.ResponseWriter, r *http.Request) {
	appHandler.ServeHTTP(w, r)
}
