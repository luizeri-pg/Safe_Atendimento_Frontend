// URLs da API - carregadas do config.js
const API_URL = window.API_CONFIG?.SENHAS_URL || "http://localhost:3000/api/senhas";

// Função auxiliar para criar AbortController com timeout (compatível com navegadores antigos)
function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, timeoutId };
}

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
            // Função mantida para compatibilidade, mas não faz nada
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

            // Chamada real à API
            (async () => {
                try {
                    const API_BASE_URL = window.API_CONFIG?.BASE_URL || 
                        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
                            ? 'http://localhost:3000/api'
                            : 'https://safeatendimento-production.up.railway.app/api');
                    
                    const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
                    const userId = loggedUser.id || loggedUser.email;
                    
                    // Tentar atualizar perfil via API
                    const response = await fetch(`${API_BASE_URL}/usuarios/${encodeURIComponent(userId)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    
                    if (response.ok) {
                        // Salvar também no localStorage como fallback
                        localStorage.setItem('userProfile', JSON.stringify(formData));
                        
                        // Update UI
                        updateUserDisplay(formData);
                        
                        // Close modal
                        closeProfileModal();
                    } else {
                        // Se não conseguir salvar na API, salvar apenas localmente
                        localStorage.setItem('userProfile', JSON.stringify(formData));
                        updateUserDisplay(formData);
                        closeProfileModal();
                    }
                } catch (error) {
                    console.error('Erro ao salvar perfil:', error);
                    // Fallback: salvar apenas localmente
                    localStorage.setItem('userProfile', JSON.stringify(formData));
                    updateUserDisplay(formData);
                    closeProfileModal();
                } finally {
                    // Reset button
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            })();
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

            // Chamada real à API
            (async () => {
                try {
                    const API_BASE_URL = window.API_CONFIG?.BASE_URL || 
                        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
                            ? 'http://localhost:3000/api'
                            : 'https://safeatendimento-production.up.railway.app/api');
                    
                    const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
                    const userId = loggedUser.id || loggedUser.email;
                    
                    // Tentar alterar senha via API
                    const response = await fetch(`${API_BASE_URL}/usuarios/${encodeURIComponent(userId)}/senha`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            currentPassword: currentPassword,
                            newPassword: newPassword
                        })
                    });
                    
                    if (response.ok) {
                        // Salvar também no localStorage como fallback
                        const passwordData = {
                            currentPassword: currentPassword,
                            newPassword: newPassword,
                            changedAt: new Date().toISOString()
                        };
                        localStorage.setItem('passwordChange', JSON.stringify(passwordData));
                        
                        // Close modal
                        closePasswordModal();
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        showFieldError('currentPassword', errorData.message || 'Erro ao alterar senha');
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        return;
                    }
                } catch (error) {
                    console.error('Erro ao alterar senha:', error);
                    showFieldError('currentPassword', 'Erro ao conectar com o servidor');
                } finally {
                    // Reset button
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            })();
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
            }
            // Validação da senha atual será feita pela API
            
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

            // Salvar configurações (localStorage é apropriado para preferências do usuário)
            localStorage.setItem('userSettings', JSON.stringify(settingsData));
            
            // Apply settings
            applySettings(settingsData);
            
            // Close modal
            closeSettingsModal();
            
            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
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
            }

            // Apply language settings
            if (settings.display.language !== 'pt-BR') {
                // In a real app, this would change the language
            }
        }

        function resetSettings() {
            if (confirm('Deseja realmente redefinir todas as configurações para os valores padrão?')) {
                localStorage.removeItem('userSettings');
                loadSettingsData();
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
                        } catch (error) {
                            console.error('Erro ao importar configurações:', error);
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
        
        // Variável para armazenar a data atual (para detectar mudança de dia)
        let currentDate = new Date().toDateString();
        
        // Função para verificar se o dia mudou e atualizar automaticamente
        function checkDateChange() {
            const now = new Date();
            const today = now.toDateString();
            
            // Se o dia mudou (meia-noite passou), atualizar dados
            if (today !== currentDate) {
                currentDate = today;
                
                // Limpar dados antigos de pacientes
                allPatientsData = [];
                
                // Recarregar dados da seção ativa
                const activeSection = document.querySelector('.section-content.active');
                if (activeSection && activeSection.id === 'patientsSection') {
                    loadPatientsFromSOC();
                } else if (activeSection && activeSection.id === 'dashboardSection') {
                    loadDashboardData();
                    loadRecentActivity();
                }
            }
        }
        
        // Função para calcular próxima meia-noite e agendar atualização
        function scheduleMidnightUpdate() {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0); // Próxima meia-noite (00:00:00)
            
            const msUntilMidnight = midnight.getTime() - now.getTime();
            
            // Agendar atualização na meia-noite
            setTimeout(() => {
                // Atualizar data atual
                currentDate = new Date().toDateString();
                
                // Limpar dados antigos de pacientes
                allPatientsData = [];
                
                // Recarregar dados da seção ativa
                const activeSection = document.querySelector('.section-content.active');
                if (activeSection && activeSection.id === 'patientsSection') {
                    loadPatientsFromSOC();
                } else if (activeSection && activeSection.id === 'dashboardSection') {
                    loadDashboardData();
                    loadRecentActivity();
                }
                
                // Agendar próxima atualização (para o próximo dia)
                scheduleMidnightUpdate();
            }, msUntilMidnight);
        }

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
                const hojeISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const socUrl = getSOCUrl(hojeISO);
                
                const response = await fetch(socUrl);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                
                const consultasSOC = await response.json();
                
                // Garantir que é um array
                if (!Array.isArray(consultasSOC)) {
                    console.error('❌ Resposta não é um array:', typeof consultasSOC, consultasSOC);
                    throw new Error('Resposta da API SOC não é um array');
                }
                
                // Verificar se há dados
                if (consultasSOC.length === 0) {
                    patientsGrid.innerHTML = `
                        <div class="col-span-full text-center py-10 text-gray-500">
                            <i class="fas fa-users text-5xl mb-4 text-gray-300"></i>
                            <h3 class="text-lg font-semibold mb-2">Nenhum paciente encontrado</h3>
                            <p class="text-sm">Não há pacientes agendados no SOC para a data consultada</p>
                        </div>
                    `;
                    if (patientsCount) patientsCount.textContent = '';
                    return;
                }
                
                // Obter data de hoje no formato DD/MM/YYYY para filtrar
                const hoje = new Date();
                const dia = String(hoje.getDate()).padStart(2, '0');
                const mes = String(hoje.getMonth() + 1).padStart(2, '0');
                const ano = hoje.getFullYear();
                const hojeFormatadoBR = `${dia}/${mes}/${ano}`;
                
                // Filtrar APENAS pacientes que têm DATACOMPROMISSO igual a hoje
                const pacientesDoDia = consultasSOC.filter(consulta => {
                    if (!consulta.DATACOMPROMISSO) {
                        return false;
                    }
                    
                    // Normalizar a data para string e remover espaços
                    const dataCompromisso = String(consulta.DATACOMPROMISSO).trim();
                    
                    // Comparar diretamente (ambas no formato DD/MM/YYYY)
                    return dataCompromisso === hojeFormatadoBR;
                });
                
                // Armazenar apenas pacientes de hoje para o filtro
                allPatientsData = pacientesDoDia;
                
                // Garantir que a seção está visível antes de renderizar
                const patientsSection = document.getElementById('patientsSection');
                if (patientsSection) {
                    patientsSection.classList.remove('hidden');
                    patientsSection.classList.add('active');
                    patientsSection.style.display = 'block';
                }
                
                // Renderizar APENAS pacientes de hoje
                renderPatients(pacientesDoDia);
                
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
            
            if (!patientsGrid) {
                console.error('❌ Elemento patientsGrid não encontrado!');
                return;
            }
            
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
        function formatarDataSOC(dataStr) {
            if (!dataStr) return 'Não agendado';
            try {
                // Se já está no formato DD/MM/YYYY, retornar como está
                if (typeof dataStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dataStr.trim())) {
                    return dataStr.trim();
                }
                // Tentar converter de ISO ou outros formatos
                const data = new Date(dataStr);
                if (isNaN(data.getTime())) return dataStr;
                return data.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (e) {
                return dataStr;
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
                
                // Verificar se API_URL está definida
                if (!API_URL) {
                    throw new Error('URL da API não configurada');
                }
                
                // Criar signal com timeout
                const { signal, timeoutId } = createTimeoutSignal(10000); // 10 segundos
                
                const response = await fetch(API_URL, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signal: signal
                }).catch(fetchError => {
                    clearTimeout(timeoutId);
                    // Capturar erros de rede
                    if (fetchError.name === 'AbortError') {
                        throw new Error('Timeout: A requisição demorou muito para responder');
                    } else if (fetchError.message && fetchError.message.includes('Load failed')) {
                        throw new Error('Erro de conexão: Não foi possível conectar ao servidor');
                    } else if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
                        throw new Error('Erro de conexão: Não foi possível conectar ao servidor');
                    }
                    throw fetchError;
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
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
                
                // Limpar flag de erro se carregou com sucesso
                window.dashboardErrorShown = false;
                
            } catch (error) {
                console.error('Erro ao carregar dados do dashboard:', error);
                
                // Detectar tipo de erro
                const isConnectionError = error.message && (
                    error.message.includes('Load failed') || 
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('Não foi possível conectar') ||
                    error.message.includes('Erro de conexão') ||
                    error.message.includes('Timeout') ||
                    error.name === 'TypeError' && error.message.includes('Load failed')
                );
                
                const is404 = error.message && error.message.includes('404');
                
                // Mostrar valores padrão em caso de erro
                const pacientesHojeEl = document.getElementById('pacientesHoje');
                const consultasRealizadasEl = document.getElementById('consultasRealizadas');
                const naFilaEl = document.getElementById('naFila');
                const tempoMedioEl = document.getElementById('tempoMedio');
                
                if (pacientesHojeEl) pacientesHojeEl.textContent = (isConnectionError || is404) ? '?' : '0';
                if (consultasRealizadasEl) consultasRealizadasEl.textContent = (isConnectionError || is404) ? '?' : '0';
                if (naFilaEl) naFilaEl.textContent = (isConnectionError || is404) ? '?' : '0';
                if (tempoMedioEl) tempoMedioEl.textContent = (isConnectionError || is404) ? '--' : '0min';
                
                // Log erro apenas na primeira vez ou se for erro de conexão
                if (!window.dashboardErrorShown || isConnectionError) {
                    window.dashboardErrorShown = true;
                    let message = 'Não foi possível carregar os dados do dashboard.';
                    
                    if (isConnectionError) {
                        const isLocalhost = window.location.hostname === 'localhost' || 
                                          window.location.hostname === '127.0.0.1';
                        message = isLocalhost 
                            ? 'Backend não está rodando. Inicie o servidor local na porta 3000.'
                            : 'Backend indisponível. Verifique se o servidor Railway está rodando.';
                    } else if (is404) {
                        message = 'Endpoint não encontrado. Verifique a configuração da API.';
                    }
                    
                    console.warn('API Indisponível:', message);
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
            
            // Gerar relatório com dados reais da API
            (async () => {
                try {
                    const API_BASE_URL = window.API_CONFIG?.BASE_URL || 
                        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
                            ? 'http://localhost:3000/api'
                            : 'https://safeatendimento-production.up.railway.app/api');
                    
                    // Buscar dados reais das senhas
                    const response = await fetch(`${API_BASE_URL}/senhas`);
                    const senhas = await response.ok ? await response.json() : [];
                    
                    const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
                    const userName = loggedUser.nome || 'Usuário';
                    
                    // Filtrar senhas por período baseado no tipo
                    const hoje = new Date();
                    let senhasFiltradas = senhas;
                    
                    if (type === 'daily') {
                        senhasFiltradas = senhas.filter(s => {
                            const dataSenha = new Date(s.data);
                            return dataSenha.toDateString() === hoje.toDateString();
                        });
                    } else if (type === 'weekly') {
                        const semanaAtras = new Date(hoje);
                        semanaAtras.setDate(hoje.getDate() - 7);
                        senhasFiltradas = senhas.filter(s => {
                            const dataSenha = new Date(s.data);
                            return dataSenha >= semanaAtras;
                        });
                    } else if (type === 'monthly') {
                        const mesAtras = new Date(hoje);
                        mesAtras.setMonth(hoje.getMonth() - 1);
                        senhasFiltradas = senhas.filter(s => {
                            const dataSenha = new Date(s.data);
                            return dataSenha >= mesAtras;
                        });
                    }
                    
                    const atendidas = senhasFiltradas.filter(s => s.status === 'atendida').length;
                    const pendentes = senhasFiltradas.filter(s => s.status === 'pendente').length;
                    const cadastros = senhasFiltradas.filter(s => s.status === 'cadastro').length;
                    
                    // Gerar conteúdo do relatório
                    const conteudoRelatorio = 
                        `=== ${reportName} ===\n` +
                        `Data: ${new Date().toLocaleDateString('pt-BR')}\n` +
                        `Gerado por: ${userName}\n` +
                        `Tipo: ${type}\n\n` +
                        `=== Estatísticas ===\n` +
                        `Total de senhas: ${senhasFiltradas.length}\n` +
                        `Atendidas: ${atendidas}\n` +
                        `Pendentes: ${pendentes}\n` +
                        `Cadastros: ${cadastros}\n\n` +
                        `=== Detalhes ===\n` +
                        senhasFiltradas.map(s => 
                            `Senha: ${s.senha} | Nome: ${s.nome || 'Sem nome'} | Status: ${s.status} | Data: ${new Date(s.data).toLocaleString('pt-BR')}`
                        ).join('\n');
                    
                    // Download do relatório
                    const link = document.createElement('a');
                    link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(conteudoRelatorio);
                    link.download = `${reportName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
                    link.click();
                } catch (error) {
                    console.error('Erro ao gerar relatório:', error);
                    alert('Erro ao gerar relatório. Tente novamente.');
                }
            })();
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
                
                // Verificar se API_URL está definida
                if (!API_URL) {
                    throw new Error('URL da API não configurada');
                }
                
                // Criar signal com timeout
                const { signal, timeoutId } = createTimeoutSignal(10000); // 10 segundos
                
                const response = await fetch(API_URL, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signal: signal
                }).catch(fetchError => {
                    clearTimeout(timeoutId);
                    // Capturar erros de rede
                    if (fetchError.name === 'AbortError') {
                        throw new Error('Timeout: A requisição demorou muito para responder');
                    } else if (fetchError.message && fetchError.message.includes('Load failed')) {
                        throw new Error('Erro de conexão: Não foi possível conectar ao servidor');
                    } else if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
                        throw new Error('Erro de conexão: Não foi possível conectar ao servidor');
                    }
                    throw fetchError;
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
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
                    // Detectar tipo de erro
                    const isConnectionError = error.message && (
                        error.message.includes('Load failed') || 
                        error.message.includes('Failed to fetch') ||
                        error.message.includes('Não foi possível conectar') ||
                        error.message.includes('Erro de conexão') ||
                        error.message.includes('Timeout') ||
                        error.name === 'TypeError' && error.message.includes('Load failed')
                    );
                    
                    const is404 = error.message && (
                        error.message.includes('404') || 
                        error.message.includes('CORS') || 
                        error.message.includes('Access-Control')
                    );
                    
                    const isLocalhost = window.location.hostname === 'localhost' || 
                                      window.location.hostname === '127.0.0.1';
                    
                    let errorMessage = 'Erro ao carregar atividades';
                    if (isConnectionError) {
                        errorMessage = isLocalhost 
                            ? 'Backend não está rodando. Inicie o servidor local na porta 3000.'
                            : 'Backend indisponível. Verifique se o servidor Railway está rodando.';
                    } else if (is404) {
                        errorMessage = 'API indisponível';
                    }
                    
                    activityList.innerHTML = `
                        <div class="text-center py-8">
                            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <i class="fas fa-exclamation-triangle text-2xl mb-2 text-yellow-600"></i>
                                <p class="text-sm text-gray-600">${errorMessage}</p>
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
            
            // Verificar mudança de dia a cada minuto (backup caso o setTimeout falhe)
            setInterval(checkDateChange, 60000); // 60000ms = 1 minuto
            
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
        
        // Agendar atualização automática na meia-noite (quando o dia mudar)
        scheduleMidnightUpdate();
        
        // Agendar atualização automática na meia-noite (quando o dia mudar)
        scheduleMidnightUpdate();

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
