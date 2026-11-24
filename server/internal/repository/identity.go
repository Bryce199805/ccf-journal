package repository

import "strconv"

// Account ownership is determined by user_id; device_id remains non-null for legacy consumers.
func accountDeviceID(userID int) string {
	return "user:" + strconv.Itoa(userID)
}
