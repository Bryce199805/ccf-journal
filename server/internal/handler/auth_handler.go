package handler

import (
	"net/http"

	"ccf-directory/internal/middleware"
	"ccf-directory/internal/model"
	"ccf-directory/internal/repository"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	userRepo     *repository.UserRepo
	favoriteRepo *repository.FavoriteRepo
	noteRepo     *repository.NoteRepo
	tagRepo      *repository.TagRepo
}

func NewAuthHandler(userRepo *repository.UserRepo, favoriteRepo *repository.FavoriteRepo, noteRepo *repository.NoteRepo, tagRepo *repository.TagRepo) *AuthHandler {
	return &AuthHandler{
		userRepo:     userRepo,
		favoriteRepo: favoriteRepo,
		noteRepo:     noteRepo,
		tagRepo:      tagRepo,
	}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	user, err := h.userRepo.Create(req.Username, string(hash))
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	token, err := middleware.GenerateToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, model.AuthResponse{Token: token, User: *user})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByUsername(req.Username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Merge device data if device_id provided
	deviceID := c.Query("device_id")
	if deviceID != "" {
		tx, err := h.userRepo.DB().Begin()
		if err == nil {
			_ = h.favoriteRepo.MergeDeviceFavorites(tx, deviceID, user.ID)
			_ = h.noteRepo.MergeDeviceNotes(tx, deviceID, user.ID)
			_ = h.tagRepo.MergeDeviceTags(tx, deviceID, user.ID)
			tx.Commit()
		}
	}

	token, err := middleware.GenerateToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, model.AuthResponse{Token: token, User: *user})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	user, err := h.userRepo.GetByID(*userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}
