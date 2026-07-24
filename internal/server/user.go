// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

package server

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/apache/airavata-custos/internal/store"
	"github.com/apache/airavata-custos/pkg/common"
	"github.com/apache/airavata-custos/pkg/models"
	"github.com/apache/airavata-custos/pkg/service"
)

// @Summary	Create a user
// @Tags	Users
// @Security	BearerAuth
// @Accept	json
// @Produce	json
// @Param	request	body	models.User	true	"User payload"
// @Success	201	{object}	models.User
// @Failure	400	{object}	object{error=string}
// @Router	/users [post]
func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var u models.User
	if err := common.DecodeJSON(r, &u); err != nil {
		common.WriteError(w, http.StatusBadRequest, err)
		return
	}
	created, err := s.svc.CreateUser(r.Context(), &u)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusCreated, created)
}

// @Summary	List users (paginated)
// @Tags	Users
// @Security	BearerAuth
// @Produce	json
// @Param	limit	query	integer	false	"Page size"
// @Param	offset	query	integer	false	"Page offset"
// @Success	200	{object}	UserListResponse
// @Router	/users [get]
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rows, total, err := s.svc.ListUsers(r.Context(), atoiOr(q.Get("limit"), 50), atoiOr(q.Get("offset"), 0))
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	if rows == nil {
		rows = []models.User{}
	}
	common.WriteJSON(w, http.StatusOK, UserListResponse{Items: rows, Total: total})
}

// @Summary	Get a user by ID
// @Tags	Users
// @Security	BearerAuth
// @Produce	json
// @Param	id	path	string	true	"User ID"
// @Success	200	{object}	models.User
// @Failure	404	{object}	object{error=string}
// @Router	/users/{id} [get]
func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	u, err := s.svc.GetUser(r.Context(), r.PathValue("id"))
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, u)
}

// @Summary	Update a user's status
// @Tags	Users
// @Security	BearerAuth
// @Accept	json
// @Produce	json
// @Param	id	path	string	true	"User ID"
// @Param	request	body	object{status=models.UserStatus}	true	"Status patch"
// @Success	200	{object}	models.User
// @Failure	400	{object}	object{error=string}
// @Failure	404	{object}	object{error=string}
// @Router	/users/{id}/status [put]
func (s *Server) updateUserStatus(w http.ResponseWriter, r *http.Request) {
	var req statusUpdateRequest
	if err := common.DecodeJSON(r, &req); err != nil {
		common.WriteError(w, http.StatusBadRequest, err)
		return
	}
	u, err := s.svc.UpdateUserStatus(r.Context(), r.PathValue("id"), models.UserStatus(req.Status))
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, u)
}

type userNameUpdateRequest struct {
	FirstName  string `json:"first_name"`
	MiddleName string `json:"middle_name"`
	LastName   string `json:"last_name"`
}

// @Summary	Update a user's name
// @Tags	Users
// @Security	BearerAuth
// @Accept	json
// @Produce	json
// @Param	id	path	string	true	"User ID"
// @Param	request	body	userNameUpdateRequest	true	"Name fields"
// @Success	200	{object}	models.User
// @Failure	400	{object}	object{error=string}
// @Failure	404	{object}	object{error=string}
// @Router	/users/{id} [put]
func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	var req userNameUpdateRequest
	if err := common.DecodeJSON(r, &req); err != nil {
		common.WriteError(w, http.StatusBadRequest, err)
		return
	}
	id := r.PathValue("id")
	if err := s.svc.UpdateUser(r.Context(), &models.User{
		ID:         id,
		FirstName:  req.FirstName,
		MiddleName: req.MiddleName,
		LastName:   req.LastName,
	}); err != nil {
		common.WriteServiceError(w, err)
		return
	}
	updated, err := s.svc.GetUser(r.Context(), id)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, updated)
}

// UserActivityListResponse is the paginated response body for GET /users/activity.
type UserActivityListResponse struct {
	Items  []store.UserActivityRow `json:"items"`
	Total  int                     `json:"total"`
	Limit  int                     `json:"limit"`
	Offset int                     `json:"offset"`
}

type InactiveUserListResponse struct {
	Items  []store.UserActivityRow `json:"items"`
	Total  int                     `json:"total"`
	Days   int                     `json:"days"`
	Limit  int                     `json:"limit"`
	Offset int                     `json:"offset"`
}

// @Summary	List user activity (paginated)
// @Description	Returns complete login activity summaries with server-side search, ordering, and pagination.
// @Tags	Users
// @Security	BearerAuth
// @Produce	json
// @Param	query	query	string	false	"Case-insensitive name or email search"
// @Param	limit	query	integer	false	"Page size (default 50, max 200)"
// @Param	offset	query	integer	false	"Page offset"
// @Param	sort	query	string	false	"Sort field: name, last_login, login_count, login_day_count, or current_streak"
// @Param	direction	query	string	false	"Sort direction: asc or desc"
// @Success	200	{object}	UserActivityListResponse
// @Failure	400	{object}	object{error=string}
// @Router	/users/activity [get]
func (s *Server) listUserActivity(w http.ResponseWriter, r *http.Request) {
	f, err := parseUserActivityFilter(r, false)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	rows, total, err := s.svc.ListUserActivity(r.Context(), f)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	if rows == nil {
		rows = []store.UserActivityRow{}
	}
	common.WriteJSON(w, http.StatusOK, UserActivityListResponse{Items: rows, Total: total, Limit: f.Limit, Offset: f.Offset})
}

// @Summary Get user activity analytics
// @Description Returns lifetime, current-month, and rolling-window login metrics plus a daily trend.
// @Tags Users
// @Security BearerAuth
// @Produce json
// @Param window query integer false "Rolling window in days: 7, 30, or 90 (default 30)"
// @Success 200 {object} store.UserActivityAnalytics
// @Failure 400 {object} object{error=string}
// @Router /users/activity/analytics [get]
func parseAnalyticsWindow(r *http.Request) (int, error) {
	windowDays := 30
	if raw := r.URL.Query().Get("window"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return 0, fmt.Errorf("%w: window must be an integer", service.ErrInvalidInput)
		}
		windowDays = value
	}
	return windowDays, nil
}

func (s *Server) getUserActivityAnalytics(w http.ResponseWriter, r *http.Request) {
	windowDays, err := parseAnalyticsWindow(r)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	result, err := s.svc.GetUserActivityAnalytics(r.Context(), windowDays)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, result)
}

// @Summary Get analytics for one selected user
// @Description Returns login engagement metrics restricted to the user identified by the path ID.
// @Tags Users
// @Security BearerAuth
// @Produce json
// @Param id path string true "User ID"
// @Param window query integer false "Rolling window in days: 7, 30, or 90 (default 30)"
// @Success 200 {object} store.UserActivityAnalytics
// @Failure 400 {object} object{error=string}
// @Failure 404 {object} object{error=string}
// @Router /users/{id}/activity/analytics [get]
func (s *Server) getSelectedUserActivityAnalytics(w http.ResponseWriter, r *http.Request) {
	windowDays, err := parseAnalyticsWindow(r)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	result, err := s.svc.GetSelectedUserActivityAnalytics(r.Context(), r.PathValue("id"), windowDays)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, result)
}

// @Summary List inactive users (paginated)
// @Description Returns users inactive for at least the requested number of user-local calendar days. Never-logged-in users are included first.
// @Tags Users
// @Security BearerAuth
// @Produce json
// @Param days query integer false "Minimum inactive calendar days (default 7, max 3650)"
// @Param query query string false "Case-insensitive name or email search"
// @Param limit query integer false "Page size (default 50, max 200)"
// @Param offset query integer false "Page offset"
// @Success 200 {object} InactiveUserListResponse
// @Failure 400 {object} object{error=string}
// @Router /users/inactive [get]
func (s *Server) listInactiveUsers(w http.ResponseWriter, r *http.Request) {
	f, err := parseUserActivityFilter(r, true)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	rows, total, err := s.svc.ListUserActivity(r.Context(), f)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	if rows == nil {
		rows = []store.UserActivityRow{}
	}
	common.WriteJSON(w, http.StatusOK, InactiveUserListResponse{
		Items: rows, Total: total, Days: f.InactiveDays, Limit: f.Limit, Offset: f.Offset,
	})
}

func parseUserActivityFilter(r *http.Request, inactive bool) (store.UserActivityFilter, error) {
	q := r.URL.Query()
	parseInt := func(name string, defaultValue int) (int, error) {
		raw := q.Get(name)
		if raw == "" {
			return defaultValue, nil
		}
		value, err := strconv.Atoi(raw)
		if err != nil {
			return 0, fmt.Errorf("%w: %s must be an integer", service.ErrInvalidInput, name)
		}
		return value, nil
	}
	limit, err := parseInt("limit", 50)
	if err != nil {
		return store.UserActivityFilter{}, err
	}
	offset, err := parseInt("offset", 0)
	if err != nil {
		return store.UserActivityFilter{}, err
	}
	days := 0
	if inactive {
		days, err = parseInt("days", 7)
		if err != nil {
			return store.UserActivityFilter{}, err
		}
		if days < 1 || days > 3650 {
			return store.UserActivityFilter{}, fmt.Errorf("%w: days must be between 1 and 3650", service.ErrInvalidInput)
		}
	}
	return store.UserActivityFilter{
		Query: q.Get("query"), InactiveDays: days, Limit: limit, Offset: offset,
		Sort: q.Get("sort"), Direction: q.Get("direction"),
	}, nil
}

type mergeUsersRequest struct {
	SurvivingUserID string `json:"surviving_user_id"`
	RetiringUserID  string `json:"retiring_user_id"`
}

// @Summary	Merge two users
// @Description	Merges the retiring user into the surviving user; the surviving record is returned.
// @Tags	Users
// @Security	BearerAuth
// @Accept	json
// @Produce	json
// @Param	request	body	mergeUsersRequest	true	"Merge payload"
// @Success	200	{object}	models.User
// @Failure	400	{object}	object{error=string}
// @Failure	404	{object}	object{error=string}
// @Router	/users/merge [post]
func (s *Server) mergeUsers(w http.ResponseWriter, r *http.Request) {
	var req mergeUsersRequest
	if err := common.DecodeJSON(r, &req); err != nil {
		common.WriteError(w, http.StatusBadRequest, err)
		return
	}
	survivor, err := s.svc.MergeUsers(r.Context(), req.SurvivingUserID, req.RetiringUserID)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, survivor)
}
