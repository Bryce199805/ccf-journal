package handler

import (
	"net/http"

	"ccf-directory/internal/middleware"
	"ccf-directory/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) UpsertNote(c *gin.Context) {
	var req model.NoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.noteRepo.Upsert(req.DeviceID, userID, req.EntryID, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "saved"})
}

func (h *Handler) DeleteNote(c *gin.Context) {
	var req model.NoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.noteRepo.Delete(req.DeviceID, userID, req.EntryID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) ListNotes(c *gin.Context) {
	deviceID := c.Query("device_id")
	userID := middleware.GetUserID(c)

	if userID != nil {
		items, err := h.noteRepo.ListByUserID(*userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if items == nil {
			items = []model.NoteItem{}
		}
		c.JSON(http.StatusOK, gin.H{"notes": items})
		return
	}

	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id or auth required"})
		return
	}

	items, err := h.noteRepo.ListByDeviceID(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if items == nil {
		items = []model.NoteItem{}
	}
	c.JSON(http.StatusOK, gin.H{"notes": items})
}
