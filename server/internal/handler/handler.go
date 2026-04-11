package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"ccf-directory/internal/middleware"
	"ccf-directory/internal/model"
	"ccf-directory/internal/repository"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	entryRepo    *repository.EntryRepo
	favoriteRepo *repository.FavoriteRepo
	noteRepo     *repository.NoteRepo
	tagRepo      *repository.TagRepo
	userRepo     *repository.UserRepo
	authHandler  *AuthHandler
}

func New(db *sql.DB) *Handler {
	favRepo := repository.NewFavoriteRepo(db)
	noteRepo := repository.NewNoteRepo(db)
	tagRepo := repository.NewTagRepo(db)
	userRepo := repository.NewUserRepo(db)

	return &Handler{
		entryRepo:    repository.NewEntryRepo(db),
		favoriteRepo: favRepo,
		noteRepo:     noteRepo,
		tagRepo:      tagRepo,
		userRepo:     userRepo,
		authHandler:  NewAuthHandler(userRepo, favRepo, noteRepo, tagRepo),
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

	// Check if favorite
	isFav := false
	deviceID := c.Query("device_id")
	userID := middleware.GetUserID(c)
	if deviceID != "" || userID != nil {
		isFav, _ = h.favoriteRepo.IsFavorite(deviceID, userID, id)
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

	userID := middleware.GetUserID(c)
	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}

	if err := h.favoriteRepo.Add(req.DeviceID, userID, req.EntryID, tags); err != nil {
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

	userID := middleware.GetUserID(c)
	if err := h.favoriteRepo.Remove(req.DeviceID, userID, req.EntryID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

// ListFavorites returns list of favorite entry IDs for a device
func (h *Handler) ListFavorites(c *gin.Context) {
	deviceID := c.Query("device_id")
	userID := middleware.GetUserID(c)

	if deviceID == "" && userID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id or auth required"})
		return
	}

	ids, err := h.favoriteRepo.ListEntryIDs(deviceID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if ids == nil {
		ids = []int{}
	}

	c.JSON(http.StatusOK, gin.H{"entry_ids": ids})
}

// UpdateFavoriteTags updates the tags for a favorite entry
func (h *Handler) UpdateFavoriteTags(c *gin.Context) {
	var req model.UpdateFavoriteTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.favoriteRepo.UpdateTags(req.DeviceID, userID, req.EntryID, req.Tags); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// RegisterRoutes registers all API routes
func (h *Handler) RegisterRoutes(api *gin.RouterGroup) {
	api.GET("/entries", h.ListEntries)
	api.GET("/entries/:id", h.GetEntry)
	api.GET("/stats", h.GetStats)
	api.POST("/favorites", h.AddFavorite)
	api.DELETE("/favorites", h.RemoveFavorite)
	api.GET("/favorites", h.ListFavorites)
	api.PUT("/favorites/tags", h.UpdateFavoriteTags)

	api.GET("/notes", h.ListNotes)
	api.PUT("/notes", h.UpsertNote)
	api.DELETE("/notes", h.DeleteNote)

	api.GET("/tags", h.ListTags)
	api.POST("/tags", h.CreateTag)
	api.PUT("/tags/:id", h.UpdateTag)
	api.DELETE("/tags/:id", h.DeleteTag)

	api.POST("/auth/register", h.authHandler.Register)
	api.POST("/auth/login", h.authHandler.Login)
	api.POST("/auth/logout", h.authHandler.Logout)
	api.GET("/auth/me", h.authHandler.Me)
}
