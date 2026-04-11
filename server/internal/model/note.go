package model

type Note struct {
	ID        int    `json:"id"`
	DeviceID  string `json:"device_id"`
	UserID    *int   `json:"user_id"`
	EntryID   int    `json:"entry_id"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updated_at"`
}

type NoteRequest struct {
	DeviceID string `json:"device_id"`
	EntryID  int    `json:"entry_id" binding:"required,min=1"`
	Content  string `json:"content"`
}

type NoteItem struct {
	EntryID   int    `json:"entry_id"`
	CCFAbbr   string `json:"ccf_abbr"`
	CCFFull   string `json:"ccf_full"`
	CCFLevel  string `json:"ccf_level"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updated_at"`
}
