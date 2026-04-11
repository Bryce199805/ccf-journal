package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func GetJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "ccf-directory-dev-secret-change-in-production"
	}
	return []byte(secret)
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := c.GetHeader("Authorization")
		if tokenStr == "" {
			c.Next()
			return
		}

		if len(tokenStr) > 7 && tokenStr[:7] == "Bearer " {
			tokenStr = tokenStr[7:]
		}

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			return GetJWTSecret(), nil
		})

		if err != nil || !token.Valid {
			c.Next()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if userID, ok := claims["user_id"].(float64); ok {
				c.Set("user_id", int(userID))
			}
			if username, ok := claims["username"].(string); ok {
				c.Set("username", username)
			}
		}
		c.Next()
	}
}

// GetUserID extracts user_id from context (nil if not logged in)
func GetUserID(c *gin.Context) *int {
	if id, exists := c.Get("user_id"); exists {
		uid := id.(int)
		return &uid
	}
	return nil
}

// RequireAuth returns 401 if no valid token
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if GetUserID(c) == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// GenerateToken creates a JWT for the given user
func GenerateToken(userID int, username string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  userID,
		"username": username,
	})
	return token.SignedString(GetJWTSecret())
}
