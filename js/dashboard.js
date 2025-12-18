const API_URL = "https://safeatendimento-production.up.railway.app/api/senhas";

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
        function showSection(section) {
            // Hide all sections
            document.querySelectorAll('.section-content').forEach(el => {
                el.classList.remove('active');
            });
            
            // Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
            });
            
            // Show selected section
            if (section === 'dashboard') {
                // Show dashboard content (default)
                document.querySelector('.dashboard-grid').style.display = 'grid';
                document.querySelector('.quick-actions').style.display = 'block';
                document.querySelector('.recent-activity').style.display = 'block';
            } else {
                // Hide dashboard content
                document.querySelector('.dashboard-grid').style.display = 'none';
                document.querySelector('.quick-actions').style.display = 'none';
                document.querySelector('.recent-activity').style.display = 'none';
                
                // Show section content
                const sectionElement = document.getElementById(section + 'Section');
                if (sectionElement) {
                    sectionElement.classList.add('active');
                }
            }
            
            // Add active class to clicked nav item
            event.target.closest('.nav-item').classList.add('active');
            
            // Load section data
            loadSectionData(section);
        }

        // Load section data
        async function loadSectionData(section) {
            try {
                const response = await fetch(API_URL);
                const senhas = await response.json();
                
                switch(section) {
                    case 'pacientes':
                        loadPatientsData(senhas);
                        break;
                    case 'consultas':
                        loadConsultationsData(senhas);
                        break;
                    case 'reports':
                        // Reports are static for now
                        break;
                }
            } catch (error) {
                console.error('Erro ao carregar dados da seção:', error);
            }
        }

        // Load patients data
        function loadPatientsData(senhas) {
            const patientsGrid = document.getElementById('patientsGrid');
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            const senhasHoje = senhas.filter(s => new Date(s.data) >= hoje);
            
            if (senhasHoje.length === 0) {
                patientsGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #718096;">
                        <i class="fas fa-users" style="font-size: 48px; margin-bottom: 16px; color: #cbd5e0;"></i>
                        <h3>Nenhum paciente hoje</h3>
                        <p>Os pacientes aparecerão aqui quando houver atendimentos</p>
                    </div>
                `;
                return;
            }
            
            patientsGrid.innerHTML = senhasHoje.map(senha => `
                <div class="patient-card">
                    <div class="patient-header">
                        <div class="patient-avatar">
                            ${senha.nome ? senha.nome.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div class="patient-info">
                            <h4>${senha.nome || 'Sem nome'}</h4>
                            <p>Senha: ${senha.senha}</p>
                        </div>
                    </div>
                    <div class="patient-status ${senha.status}">
                        ${senha.status === 'atendida' ? 'Atendido' : 
                          senha.status === 'pendente' ? 'Aguardando' : 'Cadastro'}
                    </div>
                </div>
            `).join('');
        }

        // Load consultations data
        function loadConsultationsData(senhas) {
            const consultationsList = document.getElementById('consultationsList');
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            const senhasHoje = senhas.filter(s => new Date(s.data) >= hoje)
                                  .sort((a, b) => new Date(b.data) - new Date(a.data));
            
            if (senhasHoje.length === 0) {
                consultationsList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #718096;">
                        <i class="fas fa-calendar-alt" style="font-size: 48px; margin-bottom: 16px; color: #cbd5e0;"></i>
                        <h3>Nenhuma consulta hoje</h3>
                        <p>As consultas aparecerão aqui quando houver atendimentos</p>
                    </div>
                `;
                return;
            }
            
            consultationsList.innerHTML = senhasHoje.map(senha => `
                <div class="consultation-item">
                    <div class="consultation-time">
                        ${new Date(senha.data).toLocaleTimeString('pt-BR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        })}
                    </div>
                    <div class="consultation-details">
                        <div class="consultation-patient">${senha.nome || 'Sem nome'}</div>
                        <div class="consultation-info">
                            Senha: ${senha.senha} • 
                            Status: ${senha.status === 'atendida' ? 'Atendido' : 
                                    senha.status === 'pendente' ? 'Aguardando' : 'Cadastro'}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Load dashboard data
        async function loadDashboardData() {
            try {
                const response = await fetch(API_URL);
                const senhas = await response.json();
                
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                
                const senhasHoje = senhas.filter(s => new Date(s.data) >= hoje);
                const atendidas = senhasHoje.filter(s => s.status === 'atendida').length;
                const pendentes = senhasHoje.filter(s => s.status === 'pendente').length;
                
                document.getElementById('pacientesHoje').textContent = senhasHoje.length;
                document.getElementById('consultasRealizadas').textContent = atendidas;
                document.getElementById('naFila').textContent = pendentes;
                
                // Tempo médio simulado
                const tempoMedio = atendidas > 0 ? Math.floor(15 + Math.random() * 10) : 0;
                document.getElementById('tempoMedio').textContent = `${tempoMedio}min`;
                
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
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
                const response = await fetch(API_URL);
                const senhas = await response.json();
                
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                
                const senhasHoje = senhas.filter(s => new Date(s.data) >= hoje)
                                      .sort((a, b) => new Date(b.data) - new Date(a.data))
                                      .slice(0, 5); // Últimas 5 atividades
                
                const activityList = document.getElementById('activityList');
                
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
                    
                    return `
                        <div class="activity-item">
                            <div class="activity-icon ${activityType.class}">
                                <i class="fas ${activityType.icon}"></i>
                            </div>
                            <div class="activity-content">
                                <div class="activity-text">${activityType.text} - ${senha.nome || 'Sem nome'}</div>
                                <div class="activity-time">${timeAgo}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                
            } catch (error) {
                console.error('Erro ao carregar atividade recente:', error);
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
        setInterval(() => {
            loadDashboardData();
            loadRecentActivity();
        }, 30000);

        // Load initial data
        loadDashboardData();
        loadRecentActivity();

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
    </script>
