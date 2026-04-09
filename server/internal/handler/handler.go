package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"ccf-directory/internal/model"
	"ccf-directory/internal/repository"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	entryRepo    *repository.EntryRepo
	favoriteRepo *repository.FavoriteRepo
}

func New(db *sql.DB) *Handler {
	return &Handler{
		entryRepo:    repository.NewEntryRepo(db),
		favoriteRepo: repository.NewFavoriteRepo(db),
	}
}

// ListEntries returns paginated list of entries with filters
func (h *Handler) ListEntries(c *gin.Context) {
	q := &model.ListQuery{
		Page:    1,
		PerPage: 20,
		Sort:    "",
		Order:   "",
	}

	if err := c.ShouldBindQuery(q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	items, total, err := h.entryRepo.List(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalPages := int(total) / q.PerPage
	if int(total)%q.PerPage > 0 {
		totalPages++
	}

	if items == nil {
		items = []model.EntryListItem{}
	}

	c.JSON(http.StatusOK, model.PaginatedResponse{
		Data:       items,
		Total:      total,
		Page:       q.Page,
		PerPage:    q.PerPage,
		TotalPages: totalPages,
	})
}

// GetEntry returns a single entry by ID
func (h *Handler) GetEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	entry, err := h.entryRepo.GetByID(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if favorite - always include is_favorite in entry response
	isFav := false
	deviceID := c.Query("device_id")
	if deviceID != "" {
		isFav, _ = h.favoriteRepo.IsFavorite(deviceID, id)
	}

	c.JSON(http.StatusOK, gin.H{
		"entry":       entry,
		"is_favorite": isFav,
	})
}

// GetStats returns database statistics
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.entryRepo.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// AddFavorite adds an entry to favorites
func (h *Handler) AddFavorite(c *gin.Context) {
	var req model.FavoriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.favoriteRepo.Add(req.DeviceID, req.EntryID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "added"})
}

// RemoveFavorite removes an entry from favorites
func (h *Handler) RemoveFavorite(c *gin.Context) {
	var req model.FavoriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.favoriteRepo.Remove(req.DeviceID, req.EntryID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

// ListFavorites returns list of favorite entry IDs for a device
func (h *Handler) ListFavorites(c *gin.Context) {
	deviceID := c.Query("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id required"})
		return
	}

	ids, err := h.favoriteRepo.ListEntryIDs(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if ids == nil {
		ids = []int{}
	}

	c.JSON(http.StatusOK, gin.H{"entry_ids": ids})
}
