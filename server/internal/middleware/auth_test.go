package middleware

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateJWTSecretUsesConfiguredValue(t *testing.T) {
	t.Setenv("JWT_SECRET", "configured-secret")
	t.Setenv("JWT_SECRET_FILE", filepath.Join(t.TempDir(), "unused"))

	secret, err := loadOrCreateJWTSecret()
	if err != nil {
		t.Fatalf("load configured secret: %v", err)
	}
	if string(secret) != "configured-secret" {
		t.Fatalf("unexpected secret: %q", secret)
	}
}

func TestLoadOrCreateJWTSecretPersistsGeneratedValue(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	secretPath := filepath.Join(t.TempDir(), "auth", "jwt_secret")
	t.Setenv("JWT_SECRET_FILE", secretPath)

	generated, err := loadOrCreateJWTSecret()
	if err != nil {
		t.Fatalf("generate secret: %v", err)
	}
	if len(generated) != 64 {
		t.Fatalf("generated secret length = %d, want 64", len(generated))
	}

	stored, err := os.ReadFile(secretPath)
	if err != nil {
		t.Fatalf("read stored secret: %v", err)
	}
	if string(stored) != string(generated) {
		t.Fatal("stored secret differs from generated secret")
	}

	reloaded, err := loadOrCreateJWTSecret()
	if err != nil {
		t.Fatalf("reload secret: %v", err)
	}
	if string(reloaded) != string(generated) {
		t.Fatal("restart would not reuse the stored secret")
	}
}
