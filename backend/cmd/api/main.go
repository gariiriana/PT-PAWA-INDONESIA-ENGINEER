package main

import (
	"fmt"
	"net/http"
	"pawa-report-maintenance/backend/core/routes"
	"pawa-report-maintenance/backend/pkg/logger"
)

func main() {
	log := logger.NewSimpleLogger()
	log.Info("Starting PT PAWA Local Backend Helper Server...")

	handler := routes.RegisterRoutes(log)

	port := "8080"
	addr := fmt.Sprintf(":%s", port)
	log.Info("Server is running on address", addr)

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Error("Failed to start local dev server", err)
	}
}
