package models

import "time"

type GPSCoords struct {
	Latitude  float64 `json:"latitude" firestore:"latitude"`
	Longitude float64 `json:"longitude" firestore:"longitude"`
	Address   string  `json:"address,omitempty" firestore:"address,omitempty"`
}

type MaintenanceStep struct {
	StepNumber int    `json:"stepNumber" firestore:"stepNumber"`
	Task       string `json:"task" firestore:"task"`
	Status     string `json:"status" firestore:"status"`
	PhotoURL   string `json:"photoUrl,omitempty" firestore:"photoUrl,omitempty"`
	Notes      string `json:"notes,omitempty" firestore:"notes,omitempty"`
}

type ReportEngineer struct {
	ID                  string            `json:"id,omitempty" firestore:"-"`
	Title               string            `json:"title" firestore:"title"`
	TemplateType        string            `json:"templateType" firestore:"templateType"`
	EngineerID          string            `json:"engineerId" firestore:"engineerId"`
	EngineerName        string            `json:"engineerName" firestore:"engineerName"`
	CreatedAt           time.Time         `json:"createdAt" firestore:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt" firestore:"updatedAt"`
	Status              string            `json:"status" firestore:"status"`
	Steps               []MaintenanceStep `json:"steps" firestore:"steps"`
	IsCorrective        bool              `json:"isCorrective,omitempty" firestore:"isCorrective,omitempty"`
	DamageDescription   string            `json:"damageDescription,omitempty" firestore:"damageDescription,omitempty"`
	RectificationPlan   string            `json:"rectificationPlan,omitempty" firestore:"rectificationPlan,omitempty"`
	PhotoBeforeURL      string            `json:"photoBeforeUrl,omitempty" firestore:"photoBeforeUrl,omitempty"`
	PhotoAfterURL       string            `json:"photoAfterUrl,omitempty" firestore:"photoAfterUrl,omitempty"`
}

type ReportHSE struct {
	ID               string    `json:"id,omitempty" firestore:"-"`
	Title            string    `json:"title" firestore:"title"`
	HSEID            string    `json:"hseId" firestore:"hseId"`
	HSEName          string    `json:"hseName" firestore:"hseName"`
	CreatedAt        time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt" firestore:"updatedAt"`
	Location         GPSCoords `json:"location" firestore:"location"`
	Category         string    `json:"category" firestore:"category"`
	Description      string    `json:"description" firestore:"description"`
	CorrectiveAction string    `json:"correctiveAction" firestore:"correctiveAction"`
	PhotoURL         string    `json:"photoUrl" firestore:"photoUrl"`
	PhotoMarkup      string    `json:"photoMarkup,omitempty" firestore:"photoMarkup,omitempty"`
	Status           string    `json:"status" firestore:"status"`
	ResolvedAt       time.Time `json:"resolvedAt,omitempty" firestore:"resolvedAt,omitempty"`
}

type PermitToWork struct {
	ID                string    `json:"id,omitempty" firestore:"-"`
	PTWNumber         string    `json:"ptwNumber" firestore:"ptwNumber"`
	Title             string    `json:"title" firestore:"title"`
	EngineerID        string    `json:"engineerId" firestore:"engineerId"`
	EngineerName      string    `json:"engineerName" firestore:"engineerName"`
	ApprovedByHSEID   string    `json:"approvedByHseId,omitempty" firestore:"approvedByHseId,omitempty"`
	ApprovedByHSEName string    `json:"approvedByHseName,omitempty" firestore:"approvedByHseName,omitempty"`
	ApprovedAt        time.Time `json:"approvedAt,omitempty" firestore:"approvedAt,omitempty"`
	Status            string    `json:"status" firestore:"status"`
	PTWDocumentURL    string    `json:"ptwDocumentUrl" firestore:"ptwDocumentUrl"`
	CreatedAt         time.Time `json:"createdAt" firestore:"createdAt"`
}

type UserProfile struct {
	UID       string    `json:"uid" firestore:"uid"`
	Email     string    `json:"email" firestore:"email"`
	Name      string    `json:"name" firestore:"name"`
	Role      string    `json:"role" firestore:"role"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}
