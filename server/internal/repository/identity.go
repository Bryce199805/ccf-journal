package repository

import "strconv"

// accountDeviceID keeps legacy (device_id, entry_id) constraints isolated per
// account while user-owned data is queried by user_id.
func accountDeviceID(userID int) string {
	return "user:" + strconv.Itoa(userID)
}
