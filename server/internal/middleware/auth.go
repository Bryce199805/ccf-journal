package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var (
	jwtSecretOnce sync.Once
	jwtSecret     []byte
	jwtSecretErr  error
)

// InitializeJWTSecret loads an explicitly configured secret, or creates a
// persistent random secret on first startup. Users never need to enter it.
func InitializeJWTSecret() error {
	jwtSecretOnce.Do(func() {
		jwtSecret, jwtSecretErr = loadOrCreateJWTSecret()
	})
	return jwtSecretErr
}

func GetJWTSecret() []byte {
	if err := InitializeJWTSecret(); err != nil {
		panic(fmt.Sprintf("initialize JWT secret: %v", err))
	}
	return jwtSecret
}

func loadOrCreateJWTSecret() ([]byte, error) {
	if configured := os.Getenv("JWT_SECRET"); strings.TrimSpace(configured) != "" {
		return []byte(configured), nil
	}

	secretPath := os.Getenv("JWT_SECRET_FILE")
	if secretPath == "" {
		secretPath = "./data/jwt_secret"
	}
	if stored, err := os.ReadFile(secretPath); err == nil {
		stored = []byte(strings.TrimSpace(string(stored)))
		if len(stored) == 0 {
			return nil, fmt.Errorf("JWT secret file %s is empty", secretPath)
		}
		return stored, nil
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read JWT secret file: %w", err)
	}

	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return nil, fmt.Errorf("generate JWT secret: %w", err)
	}
	generated := []byte(hex.EncodeToString(randomBytes))
	if err := os.MkdirAll(filepath.Dir(secretPath), 0700); err != nil {
		return nil, fmt.Errorf("create JWT secret directory: %w", err)
	}
	if err := os.WriteFile(secretPath, generated, 0600); err != nil {
		return nil, fmt.Errorf("write JWT secret file: %w", err)
	}
	return generated, nil
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
		}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))

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
		"iat":      time.Now().Unix(),
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})
	return token.SignedString(GetJWTSecret())
}
