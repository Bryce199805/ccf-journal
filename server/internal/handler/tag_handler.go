package handler

import (
	"net/http"
	"strconv"

	"ccf-directory/internal/middleware"
	"ccf-directory/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListTags(c *gin.Context) {
	deviceID := c.Query("device_id")
	userID := middleware.GetUserID(c)

	if userID != nil {
		tags, err := h.tagRepo.ListByUserID(*userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if tags == nil {
			tags = []model.Tag{}
		}
		c.JSON(http.StatusOK, gin.H{"tags": tags})
		return
	}

	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id or auth required"})
		return
	}

	tagDefs, err := h.tagRepo.AggregateTagsFromFavorites(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if tagDefs == nil {
		tagDefs = []model.TagDef{}
	}
	c.JSON(http.StatusOK, gin.H{"tags": tagDefs})
}

func (h *Handler) CreateTag(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req model.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tag, err := h.tagRepo.Create(*userID, req.Name, req.Color)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "tag already exists"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tag": tag})
}

func (h *Handler) UpdateTag(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	tagID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tag id"})
		return
	}

	existing, err := h.tagRepo.GetByID(tagID)
	if err != nil || existing.UserID != *userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "tag not found"})
		return
	}

	var req model.UpdateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tag, err := h.tagRepo.Update(tagID, req.Name, req.Color)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tag": tag})
}

func (h *Handler) DeleteTag(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	tagID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tag id"})
		return
	}

	existing, err := h.tagRepo.GetByID(tagID)
	if err != nil || existing.UserID != *userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "tag not found"})
		return
	}

	tx, err := h.userRepo.DB().Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.tagRepo.RemoveTagFromFavorites(tx, *userID, existing.Name)
	_ = h.tagRepo.Delete(tagID)
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
