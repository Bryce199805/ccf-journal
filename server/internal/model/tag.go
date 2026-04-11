package model

type Tag struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	CreatedAt string `json:"created_at"`
}

type CreateTagRequest struct {
	Name  string `json:"name" binding:"required,min=1,max=20"`
	Color string `json:"color"`
}

type UpdateTagRequest struct {
	Name  string `json:"name" binding:"required,min=1,max=20"`
	Color string `json:"color"`
}

type TagDef struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}
