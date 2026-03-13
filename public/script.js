// script.js
const API_URL = '/api';
let pointsBarChart = null; // Chart instance for bar chart
let allCandidatesData = [];
let filteredCandidatesData = []; // Global variable to store filtered data for PDF export
let paperMarkingData = []; // Global variable for paper marking (not in DB)

document.addEventListener('DOMContentLoaded', async () => {

    // --- Check login status on page load ---
    try {
        const authResponse = await fetch(`${API_URL}/auth/status`);
        if (!authResponse.ok) throw new Error('Auth check failed');
        const authResult = await authResponse.json();

        if (authResult.loggedIn) {
            const usernameEl = document.getElementById('loggedInUsername');
            if (usernameEl) usernameEl.textContent = authResult.username;
        } else {
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = '/Login';
                return;
            }
        }
    } catch (error) {
        console.error("Authentication check failed:", error);
        if (!window.location.pathname.endsWith('login.html')) {
             window.location.href = '/Login';
             return;
        }
    }
    // --- End of Auth Check ---

    // --- Logout Button Logic ---
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch(`${API_URL}/logout`, { method: 'POST' });
                const result = await response.json();
                if (response.ok && result.success) {
                    window.location.href = '/Login';
                } else {
                    alert('Logout failed: ' + (result.message || 'Unknown error'));
                }
            } catch (error) {
                console.error('Logout request failed:', error);
                alert('An error occurred during logout.');
            }
        });
    }
    // --- End of Logout Logic ---

    // --- showAlert function for auto-dismiss ---
    function showAlert(paneId, message, isSuccess, autoDismiss = false) {
        const targetPane = document.getElementById(paneId);
        if (!targetPane) return;
        const placeholder = targetPane.querySelector('.alert-placeholder');
        if (!placeholder) return;

        const alertType = isSuccess ? 'success' : 'danger';
        const alertHTML = `
            <div class="alert alert-${alertType} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        placeholder.innerHTML = alertHTML; // Replace existing alert

        if (!isSuccess && autoDismiss) {
            setTimeout(() => {
                const errorAlert = placeholder.querySelector('.alert-danger');
                if (errorAlert) {
                    const alertInstance = bootstrap.Alert.getOrCreateInstance(errorAlert);
                    if(alertInstance) alertInstance.close();
                }
            }, 3000);
        }
    }

    // --- Logic to hide offcanvas on link click ---
    const sidebarElement = document.getElementById('sidebar');
    let sidebar = null;
    if (sidebarElement) {
        sidebar = new bootstrap.Offcanvas(sidebarElement);
        document.querySelectorAll('#sidebar .nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (!link.href || link.getAttribute('href').startsWith('#') || link.hasAttribute('data-bs-toggle')) {
                     if(sidebar) sidebar.hide();
                }
            });
        });
    }

    // --- Dashboard Logic ---
    let currentTopUserGenderFilter = 'all';

    async function loadDashboardData() {
        let summaryUrl = `${API_URL}/summary`;
        if (currentTopUserGenderFilter !== 'all') {
            summaryUrl += `?gender=${encodeURIComponent(currentTopUserGenderFilter)}`;
        }
        try {
            const response = await fetch(summaryUrl);
            if (!response.ok) throw new Error(`Failed to load summary data. Status: ${response.status}`);
            const result = await response.json();

            if (result.success) {
                const candidatesEl = document.getElementById('stat-total-candidates');
                const pointsEl = document.getElementById('stat-total-points');
                const attendanceEl = document.getElementById('stat-today-attendance'); // Use updated ID

                if(candidatesEl) candidatesEl.textContent = result.stats.totalCandidates;
                if(pointsEl) pointsEl.textContent = result.stats.totalPoints;
                if(attendanceEl) attendanceEl.textContent = result.stats.todayAttendance; // Use updated key

                renderBarChart(result.charts.pointsPerDay);
                renderTopUsers(result.charts.topUsers);
                renderActivityFeed(result.feed);
            } else {
                 console.error('API Error fetching dashboard data:', result.message);
                 showAlert('dashboard', `Could not load dashboard data: ${result.message}`, false);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
             showAlert('dashboard', `Could not load dashboard data. Error: ${error.message}`, false);
        }
    }

    // Updated renderBarChart with manual date parsing fix
    function renderBarChart(data) {
        const chartElement = document.getElementById('pointsBarChart');
        if (!chartElement) return;
        const ctx = chartElement.getContext('2d');

        const labels = data.map(d => {
            if (!d.date || typeof d.date !== 'string') return 'Invalid Date';
            const parts = d.date.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    const dateObj = new Date(Date.UTC(year, month, day));
                    if (!isNaN(dateObj.getTime())) {
                        return dateObj.toLocaleDateString(undefined, { timeZone: 'UTC' });
                    }
                }
            }
            return 'Invalid Date';
        });
        const values = data.map(d => d.total);
        if (pointsBarChart) pointsBarChart.destroy();
        pointsBarChart = new Chart(ctx, {
             type: 'bar',
             data: { labels: labels, datasets: [{ label: 'Points Awarded', data: values, backgroundColor: 'rgba(88, 86, 214, 0.7)', borderColor: 'rgba(88, 86, 214, 1)', borderWidth: 1, borderRadius: 5 }] },
             options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45, minRotation: 0 }}}, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (tooltipItems) => tooltipItems[0].label }}} }
        });
    }

    function renderTopUsers(topUsers) {
         const topUsersList = document.getElementById('top-users-list');
         if (!topUsersList) return;
         topUsersList.innerHTML = '';
         if (topUsers.length === 0) {
             topUsersList.innerHTML = '<li class="list-group-item text-muted">No users found for this filter.</li>';
             return;
         }
         topUsers.forEach(user => {
             topUsersList.innerHTML += `<li class="list-group-item"><div><span class="user-name">${user.name}</span><span class="user-uid">UID: ${user.uid}</span></div><span class="user-points">${user.total} pts</span></li>`;
         });
    }

    function renderActivityFeed(feed) {
        const feedElement = document.getElementById('activity-feed');
         if (!feedElement) return;
        feedElement.innerHTML = '';
        if (feed.length === 0) {
            feedElement.innerHTML = '<li class="list-group-item text-muted">No recent activity.</li>';
            return;
        }
        feed.forEach(item => {
            const adminInfo = item.admin_username ? `<span class="activity-admin">by ${item.admin_username}</span>` : '';
            feedElement.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center"><div><span class="activity-name">${item.name} (${item.candidate_uid})</span><span class="activity-reason d-block">${item.reason} ${adminInfo}</span></div><span class="activity-points">${item.points > 0 ? '+' : ''}${item.points}</span></li>`;
        });
    }

    // Top 3 User Gender Filter Buttons Listener
    const topUserGenderFilterButtons = document.querySelectorAll('[data-top-gender-filter]');
    topUserGenderFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentTopUserGenderFilter = button.getAttribute('data-top-gender-filter');
            topUserGenderFilterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            loadDashboardData();
        });
    });

    // Load dashboard when tab is shown
    const dashboardTab = document.getElementById('dashboard-tab');
    if (dashboardTab) {
        dashboardTab.addEventListener('show.bs.tab', loadDashboardData);
        if (dashboardTab.classList.contains('active')) loadDashboardData();
    }

    // --- Form Handlers ---

    // 1. Create Candidate
    const createCandidateForm = document.getElementById('createCandidateForm');
    if (createCandidateForm) {
        createCandidateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paneId = 'create-candidate';
            const nameInput = document.getElementById('name');
            const ageInput = document.getElementById('age');
            const phoneInput = document.getElementById('phone');
            const selectedGender = document.querySelector('input[name="gender"]:checked');
            const age = parseInt(ageInput.value, 10);
            if (isNaN(age) || age < 4) { showAlert(paneId, 'Age must be 4 or greater.', false, true); ageInput.focus(); return; }
            const phone = phoneInput.value;
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone)) { showAlert(paneId, 'Phone number must be exactly 10 digits.', false, true); phoneInput.focus(); return; }
            if (!selectedGender) { showAlert(paneId, 'Please select a gender.', false, true); return; }
            const candidateData = { name: nameInput.value, age: age, phone: phone, gender: selectedGender.value };
            try {
                const response = await fetch(`${API_URL}/candidates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidateData) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || `HTTP error! status: ${response.status}`);
                showAlert(paneId, `Candidate created with UID: ${result.uid}`, true);
                e.target.reset();
            } catch (error) { showAlert(paneId, error.message, false, true); }
        });
    }


    // 2. View Candidate Function
    async function fetchAndDisplayCandidate(searchTerm, paneId = 'view-candidate') {
        const detailsDiv = document.getElementById('candidateDetails');
        if(!detailsDiv) return;
        detailsDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        try {
            const response = await fetch(`${API_URL}/candidates?searchTerm=${encodeURIComponent(searchTerm)}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `HTTP error! status: ${response.status}`);
            const data = result.data;
            const attendanceBadges = data.attendance.length > 0 ? data.attendance.map(d => `<span class="badge bg-secondary me-1">Day ${d}</span>`).join(' ') : '<span class="text-muted">None</span>';
            const logRows = data.logs.length > 0 ? data.logs.map(log => `<tr><td>${new Date(log.awarded_at).toLocaleString()}</td><td>${log.reason}</td><td>${log.admin_username || '<i class="text-muted">N/A</i>'}</td><td class="text-end">${log.points > 0 ? '+' : ''}${log.points}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">No point history.</td></tr>';
            detailsDiv.innerHTML = `<div class="row"> <div class="col-lg-5 mb-3 mb-lg-0"> <div class="card shadow-sm border-0"> <div class="card-header bg-dark text-white"><h4 class="mb-0">${data.name}</h4><span class="fs-6">UID: ${data.uid}</span></div> <div class="card-body"> <p><strong><i class="bi bi-person me-2"></i>Age:</strong> ${data.age}</p> <p><strong><i class="bi bi-phone me-2"></i>Phone:</strong> ${data.phone}</p> <p><strong><i class="bi bi-gender-ambiguous me-2"></i>Gender:</strong> ${data.gender}</p><hr> <p class="mb-2"><strong><i class="bi bi-calendar-check me-2"></i>Attendance:</strong></p><p>${attendanceBadges}</p><hr> <h3 class="text-center">Total Points: <span class="badge bg-primary fs-3">${data.total_points}</span></h3><hr> <button class="btn btn-outline-danger w-100" id="deleteCandidateBtn" data-uid="${data.uid}"><i class="bi bi-trash-fill me-2"></i>Delete Candidate</button> </div> </div> </div> <div class="col-lg-7"> <h4 class="mb-3">Point History</h4> <div class="card shadow-sm border-0"> <div class="log-table-container table-responsive"> <table class="table table-striped table-hover mb-0"> <thead class="table-light" style="position: sticky; top: 0;"><tr><th>Date & Time</th><th>Reason</th><th>Admin</th><th class="text-end">Points</th></tr></thead> <tbody>${logRows}</tbody> </table> </div> </div> </div> </div>`;
             const deleteBtn = document.getElementById('deleteCandidateBtn');
             if(deleteBtn) {
                 deleteBtn.addEventListener('click', async (btnEvent) => {
                    const uid = btnEvent.currentTarget.dataset.uid;
                    if (!confirm(`Are you sure you want to delete candidate ${uid}? This action cannot be undone.`)) return;
                    try {
                        const deleteResponse = await fetch(`${API_URL}/candidates/${uid}`, { method: 'DELETE' });
                        const deleteResult = await deleteResponse.json();
                        if (!deleteResponse.ok) throw new Error(deleteResult.message || `HTTP error! status: ${deleteResponse.status}`);
                        showAlert(paneId, deleteResult.message, true);
                        detailsDiv.innerHTML = '';
                        const searchInput = document.getElementById('searchTerm');
                        if (searchInput) searchInput.value = '';
                    } catch (error) { showAlert(paneId, error.message, false, true); }
                });
             }
        } catch (error) {
            detailsDiv.innerHTML = '';
            showAlert(paneId, error.message, false, true);
        }
    }

    // View Candidate Form Submission
    const viewCandidateForm = document.getElementById('viewCandidateForm');
    if (viewCandidateForm) {
        viewCandidateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paneId = 'view-candidate';
            const searchTermInput = document.getElementById('searchTerm');
            if (searchTermInput) {
                const searchTerm = searchTermInput.value;
                await fetchAndDisplayCandidate(searchTerm, paneId);
            }
        });
    }

    // 3. Add Points for Event (Bulk) - NOW WITH DROPDOWN LOGIC
    const eventPointsForm = document.getElementById('eventPointsForm');
    if (eventPointsForm) {
        eventPointsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paneId = 'event-points';
            const data = { eventName: document.getElementById('eventName').value, points: document.getElementById('eventPoints').value, uids: document.getElementById('eventUids').value };
            try {
                const response = await fetch(`${API_URL}/event-points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                const result = await response.json();
                 if (!response.ok && response.status !== 200) throw new Error(result.message || `HTTP error! status: ${response.status}`);
                showAlert(paneId, result.message, result.success);
                if (result.success) e.target.reset();
            } catch(error) { showAlert(paneId, `Error processing bulk points: ${error.message}`, false); }
        });
    }

    // 4. Mark Attendance (Bulk - Renamed)
    const attendanceForm = document.getElementById('attendanceForm');
    if (attendanceForm) {
        attendanceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paneId = 'attendance';
            const data = { day: document.getElementById('attendanceEventDay').value, uids: document.getElementById('attendanceUids').value };
             try {
                const response = await fetch(`${API_URL}/attendance/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                const result = await response.json();
                 if (!response.ok && response.status !== 200) throw new Error(result.message || `HTTP error! status: ${response.status}`);
                showAlert(paneId, result.message, result.success);
                if (result.success) e.target.reset();
             } catch(error) { showAlert(paneId, `Error processing bulk attendance: ${error.message}`, false); }
        });
    }


    // 5. "All Candidates" Tab Logic
    async function loadAllCandidates() {
        const bodyElement = document.getElementById('allCandidatesBody');
        if (!bodyElement) return;
        bodyElement.innerHTML = '<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Loading...</span></div></td></tr>';
        try {
            const response = await fetch(`${API_URL}/candidates/all`);
            const result = await response.json();
             if (!response.ok) throw new Error(result.message || `HTTP error! status: ${response.status}`);
            if (result.success) {
                // The 'attended_days' field comes as a string "1,2,3" or null
                allCandidatesData = result.data;
                applyFiltersAndSort();
            } else { bodyElement.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${result.message}</td></tr>`; }
        } catch (error) { bodyElement.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load candidates: ${error.message}</td></tr>`; }
    }

    // === MODIFIED applyFiltersAndSort function ===
    function applyFiltersAndSort() {
        filteredCandidatesData = [...allCandidatesData]; // Use global variable
        
        const genderEl = document.getElementById('filterGender');
        const sortEl = document.getElementById('filterSort');
        const searchEl = document.getElementById('filterSearch');
        const attendanceEl = document.getElementById('filterAttendance'); // New filter
        
        const gender = genderEl ? genderEl.value : 'all';
        const sortBy = sortEl ? sortEl.value : 'uid';
        const search = searchEl ? searchEl.value.toLowerCase().trim() : '';
        const attendance = attendanceEl ? attendanceEl.value : 'all'; // New filter value

        // Gender filter
        if (gender !== 'all') { filteredCandidatesData = filteredCandidatesData.filter(c => c.gender === gender); }
        
        // Search filter
        if (search) { filteredCandidatesData = filteredCandidatesData.filter(c => c.name.toLowerCase().includes(search) || c.uid.toString().includes(search) || (c.phone && c.phone.includes(search))); }

        // Attendance filter
        if (attendance !== 'all') {
            // Helper function to get attendance count
            const getAttendanceCount = (c) => {
                if (!c.attended_days) return 0;
                return c.attended_days.split(',').length;
            };

            if (attendance === 'day1') {
                filteredCandidatesData = filteredCandidatesData.filter(c => c.attended_days && c.attended_days.split(',').includes('1'));
            } else if (attendance === 'day2') {
                filteredCandidatesData = filteredCandidatesData.filter(c => c.attended_days && c.attended_days.split(',').includes('2'));
            } else if (attendance === 'day3') {
                filteredCandidatesData = filteredCandidatesData.filter(c => c.attended_days && c.attended_days.split(',').includes('3'));
            } else if (attendance === 'day4') {
                filteredCandidatesData = filteredCandidatesData.filter(c => c.attended_days && c.attended_days.split(',').includes('4'));
            } else if (attendance === 'day5') {
                filteredCandidatesData = filteredCandidatesData.filter(c => c.attended_days && c.attended_days.split(',').includes('5'));
            
            // --- NEW COUNT-BASED FILTERS ---
            } else if (attendance === 'only_1_day') {
                filteredCandidatesData = filteredCandidatesData.filter(c => getAttendanceCount(c) === 1);
            } else if (attendance === 'only_2_days') {
                filteredCandidatesData = filteredCandidatesData.filter(c => getAttendanceCount(c) === 2);
            } else if (attendance === 'only_3_days') {
                filteredCandidatesData = filteredCandidatesData.filter(c => getAttendanceCount(c) === 3);
            } else if (attendance === 'only_4_days') {
                filteredCandidatesData = filteredCandidatesData.filter(c => getAttendanceCount(c) === 4);
            } else if (attendance === 'all_days_5') {
                 filteredCandidatesData = filteredCandidatesData.filter(c => getAttendanceCount(c) === 5);
            }
            // --- END NEW FILTERS ---
        }
        
        // Sort
        filteredCandidatesData.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'total_points') return b.total_points - a.total_points;
            if (sortBy === 'today_points') return b.today_points - a.today_points;
            return a.uid - b.uid;
        });
        
        renderAllCandidates(filteredCandidatesData);
    }
    // === END MODIFIED function ===

    // === MODIFIED renderAllCandidates function ===
    function renderAllCandidates(candidates) {
        const allCandidatesBody = document.getElementById('allCandidatesBody');
        if (!allCandidatesBody) return;
        allCandidatesBody.innerHTML = '';
        if (candidates.length > 0) {
            candidates.forEach((c, index) => {
                allCandidatesBody.innerHTML += `<tr data-uid="${c.uid}"><td>${index + 1}</td><th scope="row">${c.uid}</th><td>${c.name}</td><td>${c.age}</td><td>${c.phone || '-'}</td><td>${c.gender}</td><td>${c.today_points}</td><td>${c.total_points}</td></tr>`;
            });
            attachRowClickListeners();
        } else { 
            allCandidatesBody.innerHTML = '<tr><td colspan="8" class="text-center">No candidates match filters.</td></tr>'; 
        }
    }
    // === END MODIFIED function ===


    // attachRowClickListeners
    function attachRowClickListeners() {
        document.querySelectorAll('#allCandidatesBody tr').forEach(row => {
            row.addEventListener('click', () => {
                const uid = row.dataset.uid;
                if (uid) {
                    const viewTabButton = document.getElementById('view-candidate-tab');
                    if (viewTabButton) {
                        const tabInstance = bootstrap.Tab.getOrCreateInstance(viewTabButton);
                         if (tabInstance) tabInstance.show();
                    }
                    const searchTermInput = document.getElementById('searchTerm');
                    if (searchTermInput) {
                        searchTermInput.value = uid;
                        fetchAndDisplayCandidate(uid, 'view-candidate');
                    }
                }
            });
        });
    }

    // Add event listeners for "All Candidates" filters
    const filterGenderSelect = document.getElementById('filterGender');
    if (filterGenderSelect) filterGenderSelect.addEventListener('change', applyFiltersAndSort);
    const filterSortSelect = document.getElementById('filterSort');
    if (filterSortSelect) filterSortSelect.addEventListener('change', applyFiltersAndSort);
    const filterSearchInput = document.getElementById('filterSearch');
    if (filterSearchInput) filterSearchInput.addEventListener('input', applyFiltersAndSort);
    const filterAttendanceSelect = document.getElementById('filterAttendance');
    if (filterAttendanceSelect) filterAttendanceSelect.addEventListener('change', applyFiltersAndSort);


    // Load "All Candidates" data when tab is shown
    const allCandidatesTab = document.getElementById('all-candidates-tab');
    if (allCandidatesTab) {
        allCandidatesTab.addEventListener('show.bs.tab', () => loadAllCandidates());
        if(allCandidatesTab.classList.contains('active')) loadAllCandidates();
    }
    
    // 6. PDF Download Button Logic (*** CORRECTED ***)
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            
            // Check if the global objects from the scripts are loaded
            if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
                showAlert('all-candidates', 'PDF library (jsPDF) not loaded. Please refresh.', false, true);
                return;
            }
            
            // Correct way to instantiate
            const doc = new window.jspdf.jsPDF();

            // *** NEW: Check for the autotable plugin on the instance ***
            if (typeof doc.autoTable === 'undefined') {
                showAlert('all-candidates', 'PDF Table plugin (autoTable) not loaded. Please refresh.', false, true);
                return;
            }
    
            const title = 'Student List';
            const head = [['UID', 'Name', 'Age', 'Phone', 'Gender', "Today's", 'Total']];
            // Use the globally filtered data
            const body = filteredCandidatesData.map(c => [
                c.uid,
                c.name,
                c.age,
                c.phone || '-',
                c.gender,
                c.today_points,
                c.total_points
            ]);
    
            doc.setFontSize(18);
            doc.text(title, 14, 22);
    
            doc.autoTable({
                startY: 30,
                head: head,
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185] } // Blue header
            });
    
            doc.save('student-list.pdf');
        });
    }


    // 7. Event Search Logic (Loads all events by default)
    const eventSearchForm = document.getElementById('eventSearchForm');
    const eventSearchTermInput = document.getElementById('eventSearchTerm');
    const eventList = document.getElementById('eventList');
    const participantListBody = document.getElementById('participantListBody');
    const selectedEventNameEl = document.getElementById('selectedEventName');

    // Function to fetch and render events (reusable)
    async function searchEvents(term = '') {
        try {
            let url = `${API_URL}/events/search`;
            if (term) {
                url += `?term=${encodeURIComponent(term)}`;
            }
            const response = await fetch(url);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to search events.');
            }
            renderEventList(result.events);
        } catch (error) {
            showAlert('event-search', error.message, false, true);
            renderEventList([]);
        }
    }

    // Search form submission (filters the existing list - or you can re-fetch)
    if (eventSearchForm) {
        eventSearchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const searchTerm = eventSearchTermInput ? eventSearchTermInput.value.trim() : '';
            await searchEvents(searchTerm); // Re-fetch with the search term
        });
    }

    function renderEventList(events) {
        if (!eventList) return;
        eventList.innerHTML = '';
        if (events.length === 0) {
            eventList.innerHTML = '<div class="list-group-item text-muted">No matching events found.</div>';
            return;
        }
        events.forEach(eventName => {
            const li = document.createElement('button');
            li.type = 'button';
            li.classList.add('list-group-item', 'list-group-item-action');
            li.textContent = eventName;
            li.dataset.eventName = eventName;
            li.addEventListener('click', handleEventSelection);
            eventList.appendChild(li);
        });
    }

    async function handleEventSelection(e) {
        const eventName = e.currentTarget.dataset.eventName;
        if (!eventName) return;

        if (selectedEventNameEl) selectedEventNameEl.textContent = `Participants for: ${eventName}`;
        renderParticipantList(null); // Show loading state

        document.querySelectorAll('#eventList .list-group-item.active').forEach(el => el.classList.remove('active'));
        e.currentTarget.classList.add('active');

        try {
            const response = await fetch(`${API_URL}/events/participants?eventName=${encodeURIComponent(eventName)}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to fetch participants.');
            }
            renderParticipantList(result.participants);
        } catch (error) {
            showAlert('event-search', error.message, false, true);
            renderParticipantList([]);
            if (selectedEventNameEl) selectedEventNameEl.textContent = `Error loading participants for: ${eventName}`;
        }
    }

    function renderParticipantList(participants) {
         if (!participantListBody) return;
         participantListBody.innerHTML = '';
         if (participants === null) {
              participantListBody.innerHTML = '<tr><td colspan="2" class="text-center"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div></td></tr>';
              return;
         }
         if (!participants || participants.length === 0) {
             participantListBody.innerHTML = '<tr><td colspan="2" class="text-muted">No participants found for this event.</td></tr>';
             return;
         }
         participants.forEach(p => {
             participantListBody.innerHTML += `<tr><td>${p.uid}</td><td>${p.name}</td></tr>`;
         });
    }

     // Load all events when Event Search tab is shown
    const eventSearchTab = document.getElementById('event-search-tab');
    if(eventSearchTab) {
        eventSearchTab.addEventListener('show.bs.tab', () => {
           if(eventSearchTermInput) eventSearchTermInput.value = '';
           renderParticipantList([]); // Clear participants
           if(selectedEventNameEl) selectedEventNameEl.textContent = 'Select an event from the list.';
           const placeholder = document.querySelector(`#event-search .alert-placeholder`);
           if(placeholder) placeholder.innerHTML = '';
           
           searchEvents(); // Call search with no term to load all
        });
    }
    
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // 8. Event Points Tab Logic (Populate Dropdown)
    
    const eventPointsTab = document.getElementById('event-points-tab');
    const existingEventSelect = document.getElementById('existingEventSelect');
    const eventNameInput = document.getElementById('eventName');

    async function loadExistingEvents() {
        if (!existingEventSelect) return;
        
        try {
            // Use the same search endpoint, but with no term to get all
            const response = await fetch(`${API_URL}/events/search`); 
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to fetch events.');
            }
            
            // Clear existing options (except first)
            existingEventSelect.innerHTML = '<option value="">-- Select an event to copy name --</option>';
            
            result.events.forEach(eventName => {
                const option = document.createElement('option');
                option.value = eventName;
                option.textContent = eventName;
                existingEventSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error("Failed to load existing events:", error);
            // Don't show an alert here, just fail gracefully
            existingEventSelect.innerHTML = '<option value="">-- Could not load events --</option>';
        }
    }
    
    // Add listener to load events when tab is shown
    if (eventPointsTab) {
        eventPointsTab.addEventListener('show.bs.tab', () => {
            loadExistingEvents();
            // Also reset the form
            const form = document.getElementById('eventPointsForm');
            if (form) form.reset();
            const placeholder = document.querySelector(`#event-points .alert-placeholder`);
            if(placeholder) placeholder.innerHTML = '';
        });
    }
    
    // Add listener to dropdown to update text input
    if (existingEventSelect) {
        existingEventSelect.addEventListener('change', () => {
            const selectedName = existingEventSelect.value;
            if (selectedName && eventNameInput) {
                eventNameInput.value = selectedName;
            }
        });
    }
    
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // 9. Paper Marking Tab Logic (*** CORRECTED ***)
    
    const paperMarkingTab = document.getElementById('paper-marking-tab');
    const paperMarkingForm = document.getElementById('paperMarkingForm');
    const paperMarkingBody = document.getElementById('paperMarkingBody');
    const filterMarkUidInput = document.getElementById('filterMarkUid');
    const filterMarkSort = document.getElementById('filterMarkSort');
    const exportMarksBtn = document.getElementById('exportMarksBtn');

    // Function to render the paper marking table from an array
    function renderPaperMarkingTable(data) {
        if (!paperMarkingBody) return;
        paperMarkingBody.innerHTML = ''; // Clear table
        
        if (data.length === 0) {
            paperMarkingBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No entries match filter.</td></tr>';
            return;
        }

        data.forEach((entry) => {
            paperMarkingBody.innerHTML += `
                <tr>
                    <td>${entry.uid}</td>
                    <td>${entry.marks}</td>
                    <td>
                        <button class="btn btn-danger" data-id="${entry.id}">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    // Function to filter AND SORT, then render
    function filterAndRenderMarks() {
        const filterUid = filterMarkUidInput ? filterMarkUidInput.value : '';
        const sortBy = filterMarkSort ? filterMarkSort.value : 'marks'; // Default to marks
        
        let filteredData = [...paperMarkingData]; // Work on a copy

        if (filterUid) {
            filteredData = filteredData.filter(e => e.uid.toString().includes(filterUid));
        }

        // Sort
        filteredData.sort((a, b) => {
            if (sortBy === 'marks') {
                // Parse as numbers for correct sorting
                return parseInt(b.marks, 10) - parseInt(a.marks, 10);
            } else { // 'uid'
                return parseInt(a.uid, 10) - parseInt(b.uid, 10);
            }
        });

        renderPaperMarkingTable(filteredData);
        return filteredData; // Return the data for the export function
    }

    // Add listener for the paper marking form
    if (paperMarkingForm) {
        paperMarkingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const uidInput = document.getElementById('markUid');
            const marksInput = document.getElementById('markMarks');
            
            const uid = uidInput.value;
            const marks = marksInput.value;

            if (!uid || !marks) {
                showAlert('paper-marking', 'Both UID and Marks are required.', false, true);
                return;
            }
            
            // *** NEW: Check for duplicate UID ***
            const isDuplicate = paperMarkingData.some(entry => entry.uid === uid);
            if (isDuplicate) {
                showAlert('paper-marking', `Error: UID ${uid} has already been marked.`, false, true);
                return; // Stop if duplicate
            }
            // *** END NEW ***

            // Add to the global array with a unique ID for deletion
            paperMarkingData.push({
                id: Date.now(), // Unique ID for deletion
                uid: uid,
                marks: marks
            });

            e.target.reset(); // Reset form
            uidInput.focus(); // Focus UID input for next entry
            filterAndRenderMarks(); // Re-render the table (which now includes sorting)
        });
    }

    // Add listener for the filter input
    if (filterMarkUidInput) {
        filterMarkUidInput.addEventListener('input', filterAndRenderMarks);
    }
    
    // Add listener for the sort dropdown
    if (filterMarkSort) {
        filterMarkSort.addEventListener('change', filterAndRenderMarks);
    }

    // Add listener for deleting entries using event delegation
    if (paperMarkingBody) {
        paperMarkingBody.addEventListener('click', (e) => {
            // Find the closest button with data-id
            const deleteButton = e.target.closest('button[data-id]');
            if (deleteButton) {
                const id = parseInt(deleteButton.dataset.id, 10);
                // Remove the item from the global array
                paperMarkingData = paperMarkingData.filter(entry => entry.id !== id);
                // Re-render the filtered list
                filterAndRenderMarks();
            }
        });
    }
    
    // *** NEW: Add listener for the export button (CORRECTED) ***
    if (exportMarksBtn) {
        exportMarksBtn.addEventListener('click', async () => {
            // 1. Check if libraries are loaded (using explicit window)
            if (typeof window.ExcelJS === 'undefined') {
                showAlert('paper-marking', 'ExcelJS library not loaded. Please refresh and try again.', false, true);
                return;
            }
            if (typeof window.saveAs === 'undefined') {
                showAlert('paper-marking', 'FileSaver library not loaded. Please refresh and try again.', false, true);
                return;
            }
            
            // 2. Get current filtered and sorted data
            const dataToExport = filterAndRenderMarks(); // This function now returns the filtered/sorted data

            if (dataToExport.length === 0) {
                showAlert('paper-marking', 'No data to export.', false, true);
                return;
            }

            // 3. Create Excel file
            try {
                const workbook = new window.ExcelJS.Workbook();
                workbook.creator = 'Event Dashboard';
                workbook.created = new Date();
                const sheet = workbook.addWorksheet('Paper Marks');

                sheet.columns = [
                    { header: 'UID', key: 'uid', width: 15 },
                    { header: 'Marks', key: 'marks', width: 15 }
                ];
                
                // Add rows (parsing marks as numbers for Excel)
                const rows = dataToExport.map(e => ({
                    uid: parseInt(e.uid, 10),
                    marks: parseInt(e.marks, 10)
                }));
                sheet.addRows(rows); 

                // 4. Generate and save
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                window.saveAs(blob, 'paper-marks.xlsx'); // Use explicit window.saveAs

            } catch (error) {
                console.error('Error exporting marks to Excel:', error);
                showAlert('paper-marking', 'Error generating Excel file.', false, true);
            }
        });
    }

    // Add listener to render table when tab is shown
    if (paperMarkingTab) {
        paperMarkingTab.addEventListener('show.bs.tab', () => {
            // Reset filter and render the full list
            if (filterMarkUidInput) filterMarkUidInput.value = '';
            if (filterMarkSort) filterMarkSort.value = 'marks'; // Reset sort
            filterAndRenderMarks();
            // Clear alerts
            const placeholder = document.querySelector(`#paper-marking .alert-placeholder`);
            if(placeholder) placeholder.innerHTML = '';
        });
    }
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

}); // End DOMContentLoaded