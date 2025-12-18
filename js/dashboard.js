// URLs da API - carregadas do config.js
const API_URL = window.API_CONFIG?.SENHAS_URL || "http://localhost:3000/api/senhas";

// Função para obter URL do SOC com data (URL fixa, só muda o parâmetro data)
function getSOCUrl(data) {
    if (window.API_CONFIG?.getSOC_URL) {
        return window.API_CONFIG.getSOC_URL(data);
    }
    // Fallback - URL fixa do SOC com parâmetro de data
    const dataParam = data || new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const baseURL = window.API_CONFIG?.BASE_URL || "http://localhost:3000/api";
    return `${baseURL}/soc?data=${dataParam}`;
}

        // Notification System
        class NotificationSystem {
            constructor() {
                this.notifications = JSON.parse(localStorage.getItem('notifications')) || [];
                this.unreadCount = this.notifications.filter(n => !n.read).length;
                this.init();
            }

            init() {
                this.updateBadge();
                this.renderNotifications();
                this.startRealTimeMonitoring();
            }

            addNotification(type, title, message, data = {}) {
                const notification = {
                    id: Date.now(),
                    type: type, // 'info', 'success', 'warning', 'error'
                    title: title,
                    message: message,
                    data: data,
                    read: false,
                    timestamp: new Date(),
                    timeAgo: 'Agora'
                };

                this.notifications.unshift(notification);
                this.unreadCount++;
                this.saveNotifications();
                this.updateBadge();
                this.renderNotifications();
                this.showToast(notification);
            }

            showToast(notification) {
                const toastContainer = document.getElementById('toastContainer');
                const toast = document.createElement('div');
                toast.className = `toast ${notification.type}`;
                toast.innerHTML = `
                    <div class="toast-icon ${notification.type}">
                        <i class="fas ${this.getIcon(notification.type)}"></i>
                    </div>
                    <div class="toast-content">
                        <div class="toast-title">${notification.title}</div>
                        <div class="toast-message">${notification.message}</div>
                    </div>
                    <button class="toast-close" onclick="this.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                toastContainer.appendChild(toast);
                
                // Animate in
                setTimeout(() => toast.classList.add('show'), 100);
                
                // Auto remove after 5 seconds
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, 5000);
            }

            getIcon(type) {
                const icons = {
                    'info': 'fa-info',
                    'success': 'fa-check',
                    'warning': 'fa-exclamation-triangle',
                    'error': 'fa-times'
                };
                return icons[type] || 'fa-info';
            }

            markAsRead(id) {
                const notification = this.notifications.find(n => n.id === id);
                if (notification && !notification.read) {
                    notification.read = true;
                    this.unreadCount--;
                    this.saveNotifications();
                    this.updateBadge();
                    this.renderNotifications();
                }
            }

            clearAllNotifications() {
                this.notifications = [];
                this.unreadCount = 0;
                this.saveNotifications();
                this.updateBadge();
                this.renderNotifications();
            }

            updateBadge() {
                const badge = document.getElementById('notificationBadge');
                if (this.unreadCount > 0) {
                    badge.style.display = 'block';
                    badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }

            renderNotifications() {
                const list = document.getElementById('notificationList');
                
                if (this.notifications.length === 0) {
                    list.innerHTML = `
                        <div class="notification-empty">
                            <i class="fas fa-bell-slash"></i>
                            <div>Nenhuma notificação</div>
                        </div>
                    `;
                    return;
                }

                list.innerHTML = this.notifications.map(notification => `
                    <div class="notification-item ${!notification.read ? 'unread' : ''}" 
                         onclick="notificationSystem.markAsRead(${notification.id})">
                        <div class="notification-icon ${notification.type}">
                            <i class="fas ${this.getIcon(notification.type)}"></i>
                        </div>
                        <div class="notification-content">
                            <div class="notification-text">${notification.title}</div>
                            <div class="notification-text" style="font-size: 13px; color: #718096;">
                                ${notification.message}
                            </div>
                            <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
                        </div>
                        ${!notification.read ? '<div class="notification-dot"></div>' : ''}
                    </div>
                `).join('');
            }

            formatTime(timestamp) {
                const now = new Date();
                const diff = now - new Date(timestamp);
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);

                if (minutes < 1) return 'Agora';
                if (minutes < 60) return `Há ${minutes}min`;
                if (hours < 24) return `Há ${hours}h`;
                return `Há ${days} dias`;
            }

            saveNotifications() {
                localStorage.setItem('notifications', JSON.stringify(this.notifications));
            }

            startRealTimeMonitoring() {
                // Monitora mudanças na API e gera notificações
                setInterval(() => {
                    this.checkForNewPatients();
                    this.checkForLongWaiting();
                    this.checkForCompletedConsultations();
                }, 10000); // Verifica a cada 10 segundos
            }

            async checkForNewPatients() {
                try {
                    // Buscar senhas
                    const response = await fetch(API_URL);
                    const senhas = await response.json();
                    
                    // Verifica se há novas senhas (simulação)
                    const newSenhas = senhas.filter(s => {
                        const senhaTime = new Date(s.data);
                        const now = new Date();
                        return (now - senhaTime) < 30000; // Últimos 30 segundos
                    });

                    newSenhas.forEach(senha => {
                        if (senha.status === 'pendente') {
                            this.addNotification(
                                'info',
                                'Novo Paciente',
                                `Senha ${senha.senha} - ${senha.nome || 'Sem nome'} aguardando atendimento`,
                                { senha: senha.senha }
                            );
                        }
                    });
                } catch (error) {
                    console.error('Erro ao verificar novos pacientes:', error);
                }
            }

            checkForLongWaiting() {
                // Simula verificação de pacientes aguardando há muito tempo
                const longWaiting = Math.random() > 0.8; // 20% de chance
                if (longWaiting) {
                    this.addNotification(
                        'warning',
                        'Paciente Aguardando',
                        'Há pacientes aguardando há mais de 30 minutos',
                        { type: 'long_waiting' }
                    );
                }
            }

            checkForCompletedConsultations() {
                // Simula notificação de consultas finalizadas
                const completed = Math.random() > 0.9; // 10% de chance
                if (completed) {
                    this.addNotification(
                        'success',
                        'Consulta Finalizada',
                        'Uma consulta foi finalizada com sucesso',
                        { type: 'consultation_completed' }
                    );
                }
            }
        }

        // Initialize notification system
        const notificationSystem = new NotificationSystem();

        // Sidebar toggle
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');
            
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        }

        // Notifications toggle
        function toggleNotifications() {
            const dropdown = document.getElementById('notificationDropdown');
            dropdown.classList.toggle('show');
        }

        // Clear all notifications
        function clearAllNotifications() {
            notificationSystem.clearAllNotifications();
        }

        // User menu toggle
        function toggleUserMenu() {
            const dropdown = document.getElementById('userMenuDropdown');
            dropdown.classList.toggle('show');
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                document.getElementById('userMenuDropdown').classList.remove('show');
            }
            if (!e.target.closest('.notifications')) {
                document.getElementById('notificationDropdown').classList.remove('show');
            }
        });

        // User menu functions
        function editProfile() {
            openProfileModal();
        }

        // Profile Modal Functions
        function openProfileModal() {
            const modal = document.getElementById('profileModal');
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // Load current profile data
            loadProfileData();
        }

        function closeProfileModal() {
            const modal = document.getElementById('profileModal');
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }

        function loadProfileData() {
            // Load current user data from localStorage or API
            const userData = JSON.parse(localStorage.getItem('userProfile')) || {
                firstName: 'João',
                lastName: 'Silva',
                email: 'medico@safe.com',
                phone: '(11) 99999-9999',
                crm: '123456-SP',
                specialty: 'clinica-geral',
                bio: 'Médico com mais de 10 anos de experiência em clínica geral, especializado em atendimento humanizado e medicina preventiva.'
            };

            document.getElementById('firstName').value = userData.firstName;
            document.getElementById('lastName').value = userData.lastName;
            document.getElementById('email').value = userData.email;
            document.getElementById('phone').value = userData.phone;
            document.getElementById('crm').value = userData.crm;
            document.getElementById('specialty').value = userData.specialty;
            document.getElementById('bio').value = userData.bio;
        }

        function saveProfile(event) {
            event.preventDefault();
            
            const formData = {
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                crm: document.getElementById('crm').value,
                specialty: document.getElementById('specialty').value,
                bio: document.getElementById('bio').value
            };

            // Validate form
            if (!validateProfileForm(formData)) {
                return;
            }

            // Show loading state
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            submitBtn.disabled = true;

            // Simulate API call
            setTimeout(() => {
                // Save to localStorage (in real app, this would be an API call)
                localStorage.setItem('userProfile', JSON.stringify(formData));
                
                // Update UI
                updateUserDisplay(formData);
                
                // Show success notification
                notificationSystem.addNotification(
                    'success',
                    'Perfil Atualizado',
                    'Suas informações foram salvas com sucesso!'
                );
                
                // Close modal
                closeProfileModal();
                
                // Reset button
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                
            }, 1500);
        }

        function validateProfileForm(data) {
            let isValid = true;
            
            // Clear previous errors
            document.querySelectorAll('.form-error').forEach(el => el.remove());
            
            // Validate required fields
            if (!data.firstName.trim()) {
                showFieldError('firstName', 'Nome é obrigatório');
                isValid = false;
            }
            
            if (!data.lastName.trim()) {
                showFieldError('lastName', 'Sobrenome é obrigatório');
                isValid = false;
            }
            
            if (!data.email.trim()) {
                showFieldError('email', 'E-mail é obrigatório');
                isValid = false;
            } else if (!isValidEmail(data.email)) {
                showFieldError('email', 'E-mail inválido');
                isValid = false;
            }
            
            if (!data.crm.trim()) {
                showFieldError('crm', 'CRM é obrigatório');
                isValid = false;
            }
            
            return isValid;
        }

        function showFieldError(fieldId, message) {
            const field = document.getElementById(fieldId);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'form-error';
            errorDiv.textContent = message;
            field.parentNode.appendChild(errorDiv);
            field.style.borderColor = '#e53e3e';
        }

        function isValidEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }

        function updateUserDisplay(data) {
            // Update user name in sidebar
            const userName = document.getElementById('userName');
            if (userName) {
                userName.textContent = `Dr. ${data.firstName} ${data.lastName}`;
            }
            
            // Update user name in topbar
            const topbarUserName = document.querySelector('.user-menu span');
            if (topbarUserName) {
                topbarUserName.textContent = `Dr. ${data.firstName} ${data.lastName}`;
            }
            
            // Update avatar initials
            const avatar = document.querySelector('.user-menu-avatar');
            if (avatar) {
                avatar.textContent = data.firstName.charAt(0) + data.lastName.charAt(0);
            }
        }

        // Handle avatar upload
        document.addEventListener('DOMContentLoaded', function() {
            const avatarInput = document.getElementById('avatarInput');
            if (avatarInput) {
                avatarInput.addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            const avatar = document.querySelector('.profile-avatar');
                            avatar.style.backgroundImage = `url(${e.target.result})`;
                            avatar.style.backgroundSize = 'cover';
                            avatar.style.backgroundPosition = 'center';
                            avatar.innerHTML = '';
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });

        // Close modal when clicking outside
        document.addEventListener('click', function(e) {
            const modal = document.getElementById('profileModal');
            if (e.target === modal) {
                closeProfileModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeProfileModal();
                closePasswordModal();
                closeSettingsModal();
            }
        });

        // Range controls for settings
        document.addEventListener('DOMContentLoaded', function() {
            const refreshInterval = document.getElementById('refreshInterval');
            const logoutTime = document.getElementById('logoutTime');
            
            if (refreshInterval) {
                refreshInterval.addEventListener('input', function() {
                    document.getElementById('refreshValue').textContent = this.value + 's';
                });
            }
            
            if (logoutTime) {
                logoutTime.addEventListener('input', function() {
                    document.getElementById('logoutValue').textContent = this.value + 'min';
                });
            }
        });

        // Password validation in real time
        document.addEventListener('DOMContentLoaded', function() {
            const newPasswordField = document.getElementById('newPassword');
            const confirmPasswordField = document.getElementById('confirmPassword');
            const currentPasswordField = document.getElementById('currentPassword');
            
            if (newPasswordField) {
                newPasswordField.addEventListener('input', function() {
                    validatePasswordRequirements();
                });
            }
            
            if (confirmPasswordField) {
                confirmPasswordField.addEventListener('input', function() {
                    validatePasswordRequirements();
                });
            }
        });

        function validatePasswordRequirements() {
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const currentPassword = document.getElementById('currentPassword').value;
            
            // Check length requirement
            const lengthReq = document.getElementById('req-length');
            if (newPassword.length >= 6) {
                lengthReq.classList.remove('invalid');
                lengthReq.classList.add('valid');
            } else {
                lengthReq.classList.remove('valid');
                lengthReq.classList.add('invalid');
            }
            
            // Check if different from current
            const differentReq = document.getElementById('req-different');
            if (newPassword && newPassword !== currentPassword) {
                differentReq.classList.remove('invalid');
                differentReq.classList.add('valid');
            } else {
                differentReq.classList.remove('valid');
                differentReq.classList.add('invalid');
            }
            
            // Check if confirmation matches
            const matchReq = document.getElementById('req-match');
            if (confirmPassword && confirmPassword === newPassword) {
                matchReq.classList.remove('invalid');
                matchReq.classList.add('valid');
            } else {
                matchReq.classList.remove('valid');
                matchReq.classList.add('invalid');
            }
            
            // Update password strength indicator
            updatePasswordStrength(newPassword);
        }

        function updatePasswordStrength(password) {
            const strengthIndicator = document.getElementById('passwordStrength');
            
            if (!password) {
                strengthIndicator.innerHTML = '';
                return;
            }
            
            let strength = 0;
            let strengthText = '';
            let strengthClass = '';
            
            // Check length
            if (password.length >= 6) strength++;
            if (password.length >= 8) strength++;
            
            // Check for uppercase
            if (/[A-Z]/.test(password)) strength++;
            
            // Check for lowercase
            if (/[a-z]/.test(password)) strength++;
            
            // Check for numbers
            if (/\d/.test(password)) strength++;
            
            // Check for special characters
            if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
            
            if (strength <= 2) {
                strengthText = 'Senha fraca';
                strengthClass = 'weak';
            } else if (strength <= 4) {
                strengthText = 'Senha média';
                strengthClass = 'medium';
            } else {
                strengthText = 'Senha forte';
                strengthClass = 'strong';
            }
            
            strengthIndicator.innerHTML = `<i class="fas fa-shield-alt"></i> ${strengthText}`;
            strengthIndicator.className = `password-strength ${strengthClass}`;
        }

        function changePassword() {
            openPasswordModal();
        }

        // Password Modal Functions
        function openPasswordModal() {
            const modal = document.getElementById('passwordModal');
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // Clear form
            document.getElementById('passwordForm').reset();
        }

        function closePasswordModal() {
            const modal = document.getElementById('passwordModal');
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }

        function savePassword(event) {
            event.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Validate form
            if (!validatePasswordForm(currentPassword, newPassword, confirmPassword)) {
                return;
            }

            // Show loading state
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Alterando...';
            submitBtn.disabled = true;

            // Simulate API call
            setTimeout(() => {
                // In real app, this would be an API call to change password
                // For demo, we'll just save to localStorage
                const passwordData = {
                    currentPassword: currentPassword,
                    newPassword: newPassword,
                    changedAt: new Date().toISOString()
                };
                
                localStorage.setItem('passwordChange', JSON.stringify(passwordData));
                
                // Show success notification
                notificationSystem.addNotification(
                    'success',
                    'Senha Alterada',
                    'Sua senha foi alterada com sucesso!'
                );
                
                // Close modal
                closePasswordModal();
                
                // Reset button
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                
            }, 2000);
        }

        function validatePasswordForm(current, newPass, confirm) {
            let isValid = true;
            
            // Clear previous errors
            document.querySelectorAll('.form-error').forEach(el => el.remove());
            document.querySelectorAll('.form-input').forEach(el => {
                el.style.borderColor = '#e2e8f0';
            });
            
            // Validate current password
            if (!current.trim()) {
                showFieldError('currentPassword', 'Senha atual é obrigatória');
                isValid = false;
            } else if (current !== 'senha123') { // In real app, this would be validated against API
                showFieldError('currentPassword', 'Senha atual incorreta');
                isValid = false;
            }
            
            // Validate new password
            if (!newPass.trim()) {
                showFieldError('newPassword', 'Nova senha é obrigatória');
                isValid = false;
            } else if (newPass.length < 6) {
                showFieldError('newPassword', 'Nova senha deve ter pelo menos 6 caracteres');
                isValid = false;
            } else if (newPass === current) {
                showFieldError('newPassword', 'Nova senha deve ser diferente da atual');
                isValid = false;
            }
            
            // Validate password confirmation
            if (!confirm.trim()) {
                showFieldError('confirmPassword', 'Confirmação de senha é obrigatória');
                isValid = false;
            } else if (confirm !== newPass) {
                showFieldError('confirmPassword', 'Confirmação de senha não confere');
                isValid = false;
            }
            
            return isValid;
        }

        function togglePasswordVisibility(fieldId) {
            const field = document.getElementById(fieldId);
            const icon = document.querySelector(`[onclick="togglePasswordVisibility('${fieldId}')"] i`);
            
            if (field.type === 'password') {
                field.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                field.type = 'password';
                icon.className = 'fas fa-eye';
            }
        }

        function settings() {
            openSettingsModal();
        }

        // Settings Modal Functions
        function openSettingsModal() {
            const modal = document.getElementById('settingsModal');
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // Load current settings
            loadSettingsData();
        }

        function closeSettingsModal() {
            const modal = document.getElementById('settingsModal');
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }

        function loadSettingsData() {
            // Load settings from localStorage
            const settings = JSON.parse(localStorage.getItem('userSettings')) || {
                notifications: {
                    email: true,
                    push: true,
                    sound: true,
                    desktop: false
                },
                display: {
                    theme: 'light',
                    language: 'pt-BR',
                    timezone: 'America/Sao_Paulo',
                    dateFormat: 'DD/MM/YYYY'
                },
                system: {
                    autoRefresh: true,
                    refreshInterval: 30,
                    autoLogout: true,
                    logoutTime: 60
                },
                privacy: {
                    analytics: true,
                    cookies: true,
                    dataSharing: false
                }
            };

            // Load notification settings
            document.getElementById('emailNotifications').checked = settings.notifications.email;
            document.getElementById('pushNotifications').checked = settings.notifications.push;
            document.getElementById('soundNotifications').checked = settings.notifications.sound;
            document.getElementById('desktopNotifications').checked = settings.notifications.desktop;

            // Load display settings
            document.getElementById('theme').value = settings.display.theme;
            document.getElementById('language').value = settings.display.language;
            document.getElementById('timezone').value = settings.display.timezone;
            document.getElementById('dateFormat').value = settings.display.dateFormat;

            // Load system settings
            document.getElementById('autoRefresh').checked = settings.system.autoRefresh;
            document.getElementById('refreshInterval').value = settings.system.refreshInterval;
            document.getElementById('autoLogout').checked = settings.system.autoLogout;
            document.getElementById('logoutTime').value = settings.system.logoutTime;

            // Load privacy settings
            document.getElementById('analytics').checked = settings.privacy.analytics;
            document.getElementById('cookies').checked = settings.privacy.cookies;
            document.getElementById('dataSharing').checked = settings.privacy.dataSharing;
        }

        function saveSettings(event) {
            event.preventDefault();
            
            const settingsData = {
                notifications: {
                    email: document.getElementById('emailNotifications').checked,
                    push: document.getElementById('pushNotifications').checked,
                    sound: document.getElementById('soundNotifications').checked,
                    desktop: document.getElementById('desktopNotifications').checked
                },
                display: {
                    theme: document.getElementById('theme').value,
                    language: document.getElementById('language').value,
                    timezone: document.getElementById('timezone').value,
                    dateFormat: document.getElementById('dateFormat').value
                },
                system: {
                    autoRefresh: document.getElementById('autoRefresh').checked,
                    refreshInterval: parseInt(document.getElementById('refreshInterval').value),
                    autoLogout: document.getElementById('autoLogout').checked,
                    logoutTime: parseInt(document.getElementById('logoutTime').value)
                },
                privacy: {
                    analytics: document.getElementById('analytics').checked,
                    cookies: document.getElementById('cookies').checked,
                    dataSharing: document.getElementById('dataSharing').checked
                }
            };

            // Show loading state
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            submitBtn.disabled = true;

            // Simulate API call
            setTimeout(() => {
                // Save to localStorage
                localStorage.setItem('userSettings', JSON.stringify(settingsData));
                
                // Apply settings
                applySettings(settingsData);
                
                // Show success notification
                notificationSystem.addNotification(
                    'success',
                    'Configurações Salvas',
                    'Suas configurações foram salvas com sucesso!'
                );
                
                // Close modal
                closeSettingsModal();
                
                // Reset button
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                
            }, 1500);
        }

        function applySettings(settings) {
            // Apply theme
            if (settings.display.theme === 'dark') {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }

            // Apply auto-refresh settings
            if (settings.system.autoRefresh) {
                const interval = settings.system.refreshInterval * 1000;
                // Clear existing interval and set new one
                if (window.refreshInterval) {
                    clearInterval(window.refreshInterval);
                }
                window.refreshInterval = setInterval(() => {
                    loadDashboardData();
                    loadRecentActivity();
                }, interval);
            } else {
                if (window.refreshInterval) {
                    clearInterval(window.refreshInterval);
                }
            }

            // Apply notification settings
            if (settings.notifications.sound) {
                // Enable sound notifications
                console.log('Sound notifications enabled');
            }

            // Apply language settings
            if (settings.display.language !== 'pt-BR') {
                // In a real app, this would change the language
                console.log('Language changed to:', settings.display.language);
            }
        }

        function resetSettings() {
            if (confirm('Deseja realmente redefinir todas as configurações para os valores padrão?')) {
                localStorage.removeItem('userSettings');
                loadSettingsData();
                
                notificationSystem.addNotification(
                    'info',
                    'Configurações Redefinidas',
                    'Todas as configurações foram redefinidas para os valores padrão'
                );
            }
        }

        function exportSettings() {
            const settings = JSON.parse(localStorage.getItem('userSettings')) || {};
            const dataStr = JSON.stringify(settings, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `safe_atendimento_settings_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            notificationSystem.addNotification(
                'success',
                'Configurações Exportadas',
                'Suas configurações foram exportadas com sucesso!'
            );
        }

        function importSettings() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        try {
                            const settings = JSON.parse(e.target.result);
                            localStorage.setItem('userSettings', JSON.stringify(settings));
                            loadSettingsData();
                            
                            notificationSystem.addNotification(
                                'success',
                                'Configurações Importadas',
                                'Suas configurações foram importadas com sucesso!'
                            );
                        } catch (error) {
                            notificationSystem.addNotification(
                                'error',
                                'Erro na Importação',
                                'Arquivo de configurações inválido'
                            );
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        }

        function logout() {
            if (confirm('Deseja realmente sair do sistema?')) {
                window.location.href = 'login.html';
            }
        }

        // Show section
        function showSection(section, event) {
            // Mapear nomes em português para IDs em inglês
            const sectionIdMap = {
                'dashboard': 'dashboard',
                'pacientes': 'patientsSection',
                'consultas': 'consultationsSection',
                'reports': 'reportsSection'
            };
            
            const sectionId = sectionIdMap[section] || section;
            
            // Hide all sections
            document.querySelectorAll('.section-content').forEach(el => {
                el.classList.remove('active');
                el.classList.add('hidden');
            });
            
            // Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active', 'bg-white/20', 'font-semibold');
            });
            
            // Show selected section
            if (section === 'dashboard') {
                // Show dashboard content (default)
                const dashboardGrid = document.querySelector('.dashboard-grid');
                const quickActions = document.querySelector('.quick-actions');
                const recentActivity = document.querySelector('.recent-activity');
                
                if (dashboardGrid) dashboardGrid.style.display = 'grid';
                if (quickActions) quickActions.style.display = 'block';
                if (recentActivity) recentActivity.style.display = 'block';
            } else {
                // Hide dashboard content
                const dashboardGrid = document.querySelector('.dashboard-grid');
                const quickActions = document.querySelector('.quick-actions');
                const recentActivity = document.querySelector('.recent-activity');
                
                if (dashboardGrid) dashboardGrid.style.display = 'none';
                if (quickActions) quickActions.style.display = 'none';
                if (recentActivity) recentActivity.style.display = 'none';
                
                // Show section content
                const sectionElement = document.getElementById(sectionId);
                if (sectionElement) {
                    // Remover todas as classes que podem esconder
                    sectionElement.classList.remove('hidden');
                    // Adicionar classe active
                    sectionElement.classList.add('active');
                    // Forçar display block para garantir que apareça
                    sectionElement.style.display = 'block';
                } else {
                    console.error('Seção não encontrada:', sectionId);
                }
            }
            
            // Add active class to clicked nav item
            if (event && event.target) {
                const navItem = event.target.closest('.nav-item');
                if (navItem) {
                    navItem.classList.add('active', 'bg-white/20', 'font-semibold');
                }
            }
            
            // Load section data
            loadSectionData(section);
        }

        // Load section data
        async function loadSectionData(section) {
            try {
                switch(section) {
                    case 'pacientes':
                        // Buscar pacientes do SOC
                        await loadPatientsFromSOC();
                        break;
                    case 'consultas':
                        // Buscar consultas das senhas
                        const response = await fetch(API_URL);
                        
                        if (!response.ok) {
                            throw new Error(`Erro HTTP: ${response.status}`);
                        }
                        
                        const senhas = await response.json();
                        
                        // Garantir que é um array
                        if (!Array.isArray(senhas)) {
                            throw new Error('Resposta da API não é um array');
                        }
                        
                        loadConsultationsData(senhas);
                        break;
                    case 'reports':
                        // Reports are static for now
                        break;
                }
            } catch (error) {
                console.error('Erro ao carregar dados da seção:', error);
                
                // Mostrar mensagem de erro nas seções
                if (section === 'pacientes') {
                    const patientsGrid = document.getElementById('patientsGrid');
                    if (patientsGrid) {
                        patientsGrid.innerHTML = `
                            <div class="col-span-full text-center py-10 text-red-500">
                                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                                <p>Erro ao carregar pacientes do SOC</p>
                                <p class="text-sm mt-2">${error.message}</p>
                            </div>
                        `;
                    }
                } else if (section === 'consultas') {
                    const consultationsList = document.getElementById('consultationsList');
                    if (consultationsList) {
                        consultationsList.innerHTML = `
                            <div class="text-center py-10 text-red-500">
                                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                                <p>Erro ao carregar consultas</p>
                            </div>
                        `;
                    }
                }
            }
        }

        // Variável global para armazenar todos os pacientes do SOC
        let allPatientsData = [];

        // Load patients from SOC - mesma lógica usada no index.js para buscar no SOC
        async function loadPatientsFromSOC() {
            const patientsGrid = document.getElementById('patientsGrid');
            const patientsCount = document.getElementById('patientsCount');
            if (!patientsGrid) return;
            
            // Mostrar loading
            patientsGrid.innerHTML = `
                <div class="col-span-full text-center py-10 text-gray-500">
                    <i class="fas fa-spinner fa-spin text-5xl mb-4 text-gray-300"></i>
                    <h3 class="text-lg font-semibold mb-2">Carregando pacientes do SOC...</h3>
                </div>
            `;
            
            try {
                // Mesma lógica do index.js: buscar SOC com data de hoje
                const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const socUrl = getSOCUrl(hoje);
                console.log('Buscando pacientes do SOC na URL:', socUrl);
                
                const response = await fetch(socUrl);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                
                const consultasSOC = await response.json();
                
                // Garantir que é um array
                if (!Array.isArray(consultasSOC)) {
                    throw new Error('Resposta da API SOC não é um array');
                }
                
                // Armazenar todos os pacientes globalmente para filtro
                allPatientsData = consultasSOC;
                
                if (consultasSOC.length === 0) {
                    patientsGrid.innerHTML = `
                        <div class="col-span-full text-center py-10 text-gray-500">
                            <i class="fas fa-users text-5xl mb-4 text-gray-300"></i>
                            <h3 class="text-lg font-semibold mb-2">Nenhum paciente encontrado no SOC</h3>
                            <p class="text-sm">Não há pacientes agendados para hoje no SOC</p>
                        </div>
                    `;
                    if (patientsCount) patientsCount.textContent = '';
                    return;
                }
                
                // Renderizar pacientes (sem filtro inicial)
                renderPatients(consultasSOC);
                
            } catch (error) {
                console.error('Erro ao carregar pacientes do SOC:', error);
                
                const is404 = error.message && (error.message.includes('404') || error.message.includes('Load failed') || 
                             error.message.includes('CORS') || error.message.includes('Access-Control'));
                
                // Detectar tipo de erro
                const isConnectionError = error.message && (
                    error.message.includes('Load failed') || 
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('Não foi possível conectar')
                );
                
                const errorMessage = isConnectionError
                    ? 'Backend não está rodando. Inicie o backend local na porta 3000.'
                    : (error.message || 'Erro desconhecido');
                
                const hoje = new Date().toISOString().split('T')[0];
                const socUrl = getSOCUrl(hoje);
                
                patientsGrid.innerHTML = `
                    <div class="col-span-full text-center py-10">
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
                            <i class="fas fa-exclamation-triangle text-4xl mb-4 text-yellow-600"></i>
                            <h3 class="text-lg font-semibold mb-2 text-gray-800">Backend Não Encontrado</h3>
                            <p class="text-sm text-gray-600 mb-4">${errorMessage}</p>
                            ${isConnectionError ? `
                                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4 text-left">
                                    <p class="text-xs font-semibold text-blue-800 mb-2">Como iniciar o backend:</p>
                                    <ol class="text-xs text-blue-700 list-decimal list-inside space-y-1">
                                        <li>Navegue até a pasta do backend</li>
                                        <li>Execute: <code class="bg-blue-100 px-1 rounded">npm start</code> ou <code class="bg-blue-100 px-1 rounded">npm run dev</code></li>
                                        <li>Verifique se está rodando na porta 3000</li>
                                    </ol>
                                </div>
                            ` : ''}
                            <p class="text-xs text-gray-500 mt-4 mb-2">URL esperada:</p>
                            <code class="text-xs bg-gray-100 px-2 py-1 rounded break-all block">${socUrl}</code>
                            <button onclick="loadSectionData('pacientes')" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
                                <i class="fas fa-redo mr-2"></i>Tentar novamente
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        // Função para renderizar pacientes
        function renderPatients(patients) {
            const patientsGrid = document.getElementById('patientsGrid');
            const patientsCount = document.getElementById('patientsCount');
            
            if (!patientsGrid) return;
            
            if (patients.length === 0) {
                patientsGrid.innerHTML = `
                    <div class="col-span-full text-center py-10 text-gray-500">
                        <i class="fas fa-search text-5xl mb-4 text-gray-300"></i>
                        <h3 class="text-lg font-semibold mb-2">Nenhum paciente encontrado</h3>
                        <p class="text-sm">Tente ajustar os termos de busca</p>
                    </div>
                `;
                if (patientsCount) patientsCount.textContent = '0 pacientes encontrados';
                return;
            }
            
            // Atualizar contador
            if (patientsCount) {
                const total = allPatientsData.length;
                const showing = patients.length;
                patientsCount.textContent = total === showing 
                    ? `${showing} paciente${showing !== 1 ? 's' : ''} encontrado${showing !== 1 ? 's' : ''}`
                    : `Mostrando ${showing} de ${total} paciente${total !== 1 ? 's' : ''}`;
            }
            
            // Formatar e exibir pacientes do SOC (mesma estrutura do index.js)
            patientsGrid.innerHTML = patients.map(consulta => {
                const nomeDisplay = consulta.NOMEFUNCIONARIO || 'Sem nome';
                const inicial = nomeDisplay.charAt(0).toUpperCase();
                const cpf = consulta.CPFFUNCIONARIO || 'N/A';
                const codigo = consulta.CODIGOFUNCIONARIO || 'N/A';
                const dataCompromisso = consulta.DATACOMPROMISSO ? 
                    formatarDataSOC(consulta.DATACOMPROMISSO) : 'Não agendado';
                
                // Formatar CPF (mesma lógica do index.js)
                const cpfFormatado = formatarCPF(cpf);
                
                return `
                    <div class="bg-white rounded-xl p-4 shadow-md border border-gray-200 hover:shadow-lg transition-shadow">
                        <div class="flex items-center gap-4 mb-3">
                            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
                                ${inicial}
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-gray-800 truncate">${nomeDisplay}</h4>
                                <p class="text-sm text-gray-600">CPF: ${cpfFormatado}</p>
                                <p class="text-sm text-gray-600">Código: ${codigo}</p>
                            </div>
                        </div>
                        <div class="border-t border-gray-200 pt-3 mt-3">
                            <div class="flex items-center justify-between text-xs text-gray-600">
                                <span><i class="fas fa-calendar-alt mr-1"></i>${dataCompromisso}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Função para filtrar pacientes
        function filterPatients() {
            const searchInput = document.getElementById('patientSearchInput');
            if (!searchInput || allPatientsData.length === 0) return;
            
            const searchTerm = searchInput.value.trim();
            
            if (searchTerm === '') {
                // Se não há busca, mostrar todos
                renderPatients(allPatientsData);
                return;
            }
            
            const searchTermLower = searchTerm.toLowerCase();
            const searchTermNumbers = searchTerm.replace(/\D/g, ''); // Apenas números
            const isOnlyNumbers = /^\d+$/.test(searchTerm); // Se é apenas números
            
            // Filtrar pacientes
            const filteredPatients = allPatientsData.filter(consulta => {
                const nome = (consulta.NOMEFUNCIONARIO || '').toLowerCase();
                const cpf = consulta.CPFFUNCIONARIO ? consulta.CPFFUNCIONARIO.toString().replace(/\D/g, '') : '';
                const codigo = (consulta.CODIGOFUNCIONARIO || '').toString();
                const codigoLower = codigo.toLowerCase();
                
                // Se a busca é apenas números e tem 6 dígitos ou menos, priorizar código
                if (isOnlyNumbers && searchTermNumbers.length <= 6) {
                    // Buscar por código primeiro (match exato ou parcial no início)
                    if (codigo === searchTerm || codigo.startsWith(searchTerm)) {
                        return true;
                    }
                    // Se não encontrou no código, buscar no nome também
                    if (nome.includes(searchTermLower)) {
                        return true;
                    }
                    // Não buscar no CPF para buscas curtas numéricas
                    return false;
                }
                
                // Para buscas mais longas ou com letras, buscar em todos os campos
                return nome.includes(searchTermLower) || 
                       (searchTermNumbers.length >= 7 && cpf.includes(searchTermNumbers)) || 
                       codigoLower.includes(searchTermLower);
            });
            
            // Renderizar pacientes filtrados
            renderPatients(filteredPatients);
        }

        // Expor função globalmente para o HTML
        window.filterPatients = filterPatients;
        
        // Helper function to format CPF
        function formatarCPF(cpf) {
            if (!cpf) return 'N/A';
            const cpfLimpo = cpf.toString().replace(/\D/g, '');
            if (cpfLimpo.length !== 11) return cpf;
            return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        }
        
        // Helper function to format SOC date
        function formatarDataSOC(dataISO) {
            if (!dataISO) return 'Não agendado';
            try {
                const data = new Date(dataISO);
                if (isNaN(data.getTime())) return dataISO;
                return data.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return dataISO;
            }
        }

        // Load consultations data
        function loadConsultationsData(senhas) {
            const consultationsList = document.getElementById('consultationsList');
            if (!consultationsList) return;
            
            // Garantir que é um array
            if (!Array.isArray(senhas)) {
                consultationsList.innerHTML = `
                    <div class="text-center py-10 text-gray-500">
                        <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                        <p>Erro ao carregar consultas</p>
                    </div>
                `;
                return;
            }
            
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            const senhasHoje = senhas
                .filter(s => {
                    if (!s.data) return false;
                    const dataSenha = new Date(s.data);
                    return dataSenha >= hoje;
                })
                .sort((a, b) => {
                    const dataA = new Date(a.data);
                    const dataB = new Date(b.data);
                    return dataB - dataA; // Mais recentes primeiro
                });
            
            if (senhasHoje.length === 0) {
                consultationsList.innerHTML = `
                    <div class="text-center py-10 text-gray-500">
                        <i class="fas fa-calendar-alt text-5xl mb-4 text-gray-300"></i>
                        <h3 class="text-lg font-semibold mb-2">Nenhuma consulta hoje</h3>
                        <p class="text-sm">As consultas aparecerão aqui quando houver atendimentos</p>
                    </div>
                `;
                return;
            }
            
            consultationsList.innerHTML = senhasHoje.map(senha => {
                const dataHora = new Date(senha.data);
                const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                const nomeDisplay = senha.nome || 'Sem nome';
                const statusText = senha.status === 'atendida' ? 'Atendido' : 
                                  senha.status === 'pendente' ? 'Aguardando' : 'Cadastro';
                const statusClass = senha.status === 'atendida' ? 'bg-green-100 text-green-800' :
                                   senha.status === 'pendente' ? 'bg-orange-100 text-orange-800' :
                                   'bg-blue-100 text-blue-800';
                
                return `
                    <div class="flex items-center gap-4 p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                        <div class="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold">
                            ${horaFormatada}
                        </div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800 mb-1">${nomeDisplay}</div>
                            <div class="text-sm text-gray-600 flex items-center gap-3">
                                <span>Senha: <strong>${senha.senha}</strong></span>
                                <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">
                                    ${statusText}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Load dashboard data
        async function loadDashboardData() {
            try {
                // Mostrar estado de loading
                const pacientesHojeEl = document.getElementById('pacientesHoje');
                const consultasRealizadasEl = document.getElementById('consultasRealizadas');
                const naFilaEl = document.getElementById('naFila');
                const tempoMedioEl = document.getElementById('tempoMedio');
                
                if (pacientesHojeEl) pacientesHojeEl.textContent = '...';
                if (consultasRealizadasEl) consultasRealizadasEl.textContent = '...';
                if (naFilaEl) naFilaEl.textContent = '...';
                if (tempoMedioEl) tempoMedioEl.textContent = '...';
                
                const response = await fetch(API_URL);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                
                const senhas = await response.json();
                
                // Garantir que é um array
                if (!Array.isArray(senhas)) {
                    throw new Error('Resposta da API não é um array');
                }
                
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                
                // Filtrar senhas de hoje
                const senhasHoje = senhas.filter(s => {
                    if (!s.data) return false;
                    const dataSenha = new Date(s.data);
                    return dataSenha >= hoje;
                });
                
                const atendidas = senhasHoje.filter(s => s.status === 'atendida').length;
                const pendentes = senhasHoje.filter(s => s.status === 'pendente').length;
                const cadastros = senhasHoje.filter(s => s.status === 'cadastro').length;
                
                // Atualizar elementos se existirem
                if (pacientesHojeEl) pacientesHojeEl.textContent = senhasHoje.length;
                if (consultasRealizadasEl) consultasRealizadasEl.textContent = atendidas;
                if (naFilaEl) naFilaEl.textContent = pendentes + cadastros; // Total na fila (pendentes + cadastros)
                
                // Calcular tempo médio baseado nos dados reais (simplificado)
                // Em uma implementação real, isso seria calculado com base no tempo real de atendimento
                let tempoMedio = 0;
                if (atendidas > 0) {
                    // Para demonstração, estimamos 15-20 minutos por consulta
                    tempoMedio = Math.floor(15 + (atendidas * 0.5));
                }
                
                if (tempoMedioEl) tempoMedioEl.textContent = tempoMedio > 0 ? `${tempoMedio}min` : '0min';
                
            } catch (error) {
                console.error('Erro ao carregar dados do dashboard:', error);
                
                // Verificar se é erro 404/CORS (API indisponível)
                const is404 = error.message && (error.message.includes('404') || error.message.includes('Load failed') || 
                             error.message.includes('CORS') || error.message.includes('Access-Control'));
                
                // Mostrar valores padrão em caso de erro
                const pacientesHojeEl = document.getElementById('pacientesHoje');
                const consultasRealizadasEl = document.getElementById('consultasRealizadas');
                const naFilaEl = document.getElementById('naFila');
                const tempoMedioEl = document.getElementById('tempoMedio');
                
                if (pacientesHojeEl) pacientesHojeEl.textContent = is404 ? '?' : '0';
                if (consultasRealizadasEl) consultasRealizadasEl.textContent = is404 ? '?' : '0';
                if (naFilaEl) naFilaEl.textContent = is404 ? '?' : '0';
                if (tempoMedioEl) tempoMedioEl.textContent = is404 ? '--' : '0min';
                
                // Mostrar notificação de erro apenas na primeira vez
                if (!window.dashboardErrorShown) {
                    window.dashboardErrorShown = true;
                    const message = is404 
                        ? 'Backend indisponível. Verifique se o servidor Railway está rodando.'
                        : 'Não foi possível carregar os dados do dashboard. Verifique sua conexão.';
                    
                    notificationSystem.addNotification(
                        'warning',
                        'API Indisponível',
                        message
                    );
                }
            }
        }

        // Generate report
        function generateReport(type) {
            const reportTypes = {
                'daily': 'Relatório Diário',
                'weekly': 'Relatório Semanal', 
                'monthly': 'Relatório Mensal',
                'productivity': 'Relatório de Produtividade'
            };
            
            const reportName = reportTypes[type] || 'Relatório';
            
            // Simula geração de relatório
            const loadingToast = notificationSystem.addNotification(
                'info',
                'Gerando Relatório',
                `${reportName} está sendo gerado...`
            );
            
            setTimeout(() => {
                notificationSystem.addNotification(
                    'success',
                    'Relatório Gerado',
                    `${reportName} foi gerado com sucesso!`
                );
                
                // Simula download do relatório
                const link = document.createElement('a');
                link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(
                    `=== ${reportName} ===\n` +
                    `Data: ${new Date().toLocaleDateString('pt-BR')}\n` +
                    `Gerado por: Dr. João Silva\n` +
                    `Tipo: ${type}\n\n` +
                    `Este é um relatório de demonstração.\n` +
                    `Em produção, aqui estariam os dados reais.`
                );
                link.download = `${reportName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
                link.click();
            }, 2000);
        }

        // Load recent activity
        async function loadRecentActivity() {
            try {
                const activityList = document.getElementById('activityList');
                if (!activityList) return;
                
                // Mostrar loading
                activityList.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #718096;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px; color: #cbd5e0;"></i>
                        <p>Carregando atividades...</p>
                    </div>
                `;
                
                const response = await fetch(API_URL);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                
                const senhas = await response.json();
                
                // Garantir que é um array
                if (!Array.isArray(senhas)) {
                    throw new Error('Resposta da API não é um array');
                }
                
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                
                // Filtrar e ordenar senhas de hoje
                const senhasHoje = senhas
                    .filter(s => {
                        if (!s.data) return false;
                        const dataSenha = new Date(s.data);
                        return dataSenha >= hoje;
                    })
                    .sort((a, b) => {
                        const dataA = new Date(a.data);
                        const dataB = new Date(b.data);
                        return dataB - dataA; // Mais recentes primeiro
                    })
                    .slice(0, 5); // Últimas 5 atividades
                
                if (senhasHoje.length === 0) {
                    activityList.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #718096;">
                            <i class="fas fa-clock" style="font-size: 24px; margin-bottom: 8px; color: #cbd5e0;"></i>
                            <p>Nenhuma atividade hoje</p>
                        </div>
                    `;
                    return;
                }
                
                activityList.innerHTML = senhasHoje.map(senha => {
                    const timeAgo = getTimeAgo(new Date(senha.data));
                    const activityType = getActivityType(senha.status);
                    const nomeDisplay = senha.nome || 'Sem nome';
                    
                    return `
                        <div class="activity-item flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br ${
                                activityType.class === 'primary' ? 'from-blue-500 to-blue-700' :
                                activityType.class === 'warning' ? 'from-orange-500 to-orange-600' :
                                'from-green-500 to-green-600'
                            } flex items-center justify-center text-white">
                                <i class="fas ${activityType.icon}"></i>
                            </div>
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-800">${activityType.text} - ${nomeDisplay}</div>
                                <div class="text-xs text-gray-500">${timeAgo}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                
            } catch (error) {
                console.error('Erro ao carregar atividade recente:', error);
                const activityList = document.getElementById('activityList');
                if (activityList) {
                    const is404 = error.message.includes('404') || error.message.includes('Load failed') || 
                                 error.message.includes('CORS') || error.message.includes('Access-Control');
                    
                    activityList.innerHTML = `
                        <div class="text-center py-8">
                            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <i class="fas fa-exclamation-triangle text-2xl mb-2 text-yellow-600"></i>
                                <p class="text-sm text-gray-600">${is404 ? 'API indisponível' : 'Erro ao carregar atividades'}</p>
                            </div>
                        </div>
                    `;
                }
            }
        }

        // Get activity type based on status
        function getActivityType(status) {
            const types = {
                'cadastro': {
                    class: 'primary',
                    icon: 'fa-user-plus',
                    text: 'Novo paciente cadastrado'
                },
                'pendente': {
                    class: 'warning',
                    icon: 'fa-clock',
                    text: 'Paciente aguardando'
                },
                'atendida': {
                    class: 'success',
                    icon: 'fa-check',
                    text: 'Consulta finalizada'
                }
            };
            return types[status] || types['cadastro'];
        }

        // Get time ago string
        function getTimeAgo(date) {
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            
            if (minutes < 1) return 'Agora';
            if (minutes < 60) return `Há ${minutes}min`;
            if (hours < 24) return `Há ${hours}h`;
            return date.toLocaleDateString('pt-BR');
        }

        // Auto-refresh data every 30 seconds
        let refreshInterval = null;

        function startAutoRefresh() {
            // Limpar intervalo anterior se existir
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
            
            // Configurar auto-refresh a cada 30 segundos
            refreshInterval = setInterval(() => {
                loadDashboardData();
                loadRecentActivity();
            }, 30000);
        }

        // Load initial data when DOM is ready
        function initDashboard() {
            // Verificar se os elementos necessários existem
            if (document.getElementById('pacientesHoje') && document.getElementById('activityList')) {
                loadDashboardData();
                loadRecentActivity();
                startAutoRefresh();
            } else {
                // Tentar novamente após um pequeno delay se os elementos não existirem ainda
                setTimeout(initDashboard, 100);
            }
        }

        // Aguardar DOM estar pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initDashboard);
        } else {
            initDashboard();
        }

        // Mobile sidebar handling
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('collapsed');
        }

        window.addEventListener('resize', () => {
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.add('collapsed');
            } else {
                document.getElementById('sidebar').classList.remove('collapsed');
            }
        });
