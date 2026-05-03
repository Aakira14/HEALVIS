const AppState = {
    currentTheme: 'dark',
    currentSection: 'home',
    isMenuOpen: false,
    isLoaded: false,
    map: null,
    userMarker: null,
    hospitalMarkers: []
};

// Small helper to escape HTML when writing into a new window
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    loadPreferences();
    initTheme();
    initNavigation();
    initScrollEffects();
    initFormHandlers();
    initMobileMenu();
    updateThemeUI();
    initMap();
    AppState.isLoaded = true;
}

function loadPreferences() {
    const savedTheme = localStorage.getItem('portfolio-theme');
    if (savedTheme) AppState.currentTheme = savedTheme;
}



function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    setTheme(AppState.currentTheme);
}

function toggleTheme() {
    const newTheme = AppState.currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('portfolio-theme', newTheme);
}

function setTheme(theme) {
    AppState.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    updateThemeUI();
}

function updateThemeUI() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = AppState.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const headerHeight = document.querySelector('.main-header').offsetHeight;
                const targetPosition = targetSection.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                updateActiveNavLink(link);
                if (AppState.isMenuOpen) {
                    toggleMobileMenu();
                }
            }
        });
    });
    
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('scroll', updateHeaderOnScroll);
}

function handleScroll() {
    const sections = document.querySelectorAll('section[id]');
    const scrollPosition = window.scrollY + 100;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            AppState.currentSection = sectionId;
            updateActiveNavLink(null, sectionId);
        }
    });
}

function updateActiveNavLink(clickedLink, sectionId = null) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (clickedLink && link === clickedLink) {
            link.classList.add('active');
        } else if (sectionId) {
            const linkSection = link.getAttribute('data-section');
            if (linkSection === sectionId) {
                link.classList.add('active');
            }
        }
    });
}

function updateHeaderOnScroll() {
    const header = document.querySelector('.main-header');
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
}

function initScrollEffects() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(element => observer.observe(element));
    
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => observer.observe(section));
}

function initFormHandlers() {
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleFormSubmit);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    console.log('Form submitted:', data);
    
    alert('Message sent successfully!');
    e.target.reset();
}

function initMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMobileMenu);
    }
    
    document.addEventListener('click', (e) => {
        const navMenu = document.getElementById('navMenu');
        const menuToggle = document.getElementById('menuToggle');
        
        if (AppState.isMenuOpen && 
            !navMenu.contains(e.target) && 
            !menuToggle.contains(e.target)) {
            toggleMobileMenu();
        }
    });
}

function toggleMobileMenu() {
    AppState.isMenuOpen = !AppState.isMenuOpen;
    const navMenu = document.getElementById('navMenu');
    const menuToggle = document.getElementById('menuToggle');
    
    if (navMenu) {
        navMenu.classList.toggle('active', AppState.isMenuOpen);
    }
    
    if (menuToggle) {
        menuToggle.classList.toggle('active', AppState.isMenuOpen);
    }
}

function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || typeof L === 'undefined') return;

    // Default view (Pune, India example from your snippet)
    AppState.map = L.map('map').setView([18.5204, 73.8567], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(AppState.map);

    AppState.userMarker = L.marker([18.5204, 73.8567]).addTo(AppState.map)
        .bindPopup("Searching for your location... 🛰️")
        .openPopup();

    // Get user's actual location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            const pos = [latitude, longitude];
            AppState.map.setView(pos, 14);
            AppState.userMarker.setLatLng(pos).bindPopup("You are here 📍").openPopup();
            
            // Auto-find hospitals nearby
            setLocationStatus(latitude, longitude, 'browser');
            console.log('Using browser geolocation:', latitude, longitude);
            findNearbyHospitals(latitude, longitude);
        }, (error) => {
            console.warn("Geolocation denied or unavailable:", error);
            // Try IP-based geolocation as a fallback (approximate)
            getIpLocation().then(loc => {
                if (loc && loc.latitude && loc.longitude) {
                    const pos = [loc.latitude, loc.longitude];
                    AppState.map.setView(pos, 13);
                    AppState.userMarker.setLatLng(pos).bindPopup("Approximate location (from IP) 📍").openPopup();
                    setLocationStatus(loc.latitude, loc.longitude, 'ip');
                    console.log('Using IP geolocation:', loc.latitude, loc.longitude);
                    findNearbyHospitals(loc.latitude, loc.longitude);
                } else {
                    console.warn('IP geolocation failed, staying at default location');
                }
            }).catch(err => {
                console.warn('IP geolocation error:', err);
            });
        });
    }

    // update location status UI helper
    function setLocationStatus(lat, lon, source) {
        const el = document.getElementById('locationStatus');
        if (el) {
            el.textContent = `Location: ${lat?.toFixed(5) || 'n/a'}, ${lon?.toFixed(5) || 'n/a'} (source: ${source})`;
        }
    }

    // IP geolocation helper
    async function getIpLocation() {
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (!res.ok) return null;
            const j = await res.json();
            return { latitude: j.latitude, longitude: j.longitude };
        } catch (e) {
            return null;
        }
    }
}

async function findNearbyHospitals(lat, lon) {
    try {
        // If coordinates not provided, try to get them from browser geolocation
        if (lat == null || lon == null) {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (position) => {
                    const { latitude, longitude } = position.coords;
                    await findNearbyHospitals(latitude, longitude);
                }, async (err) => {
                    console.warn('Geolocation unavailable or denied when requested:', err);
                    // Try IP fallback
                    const loc = await getIpLocation();
                    if (loc && loc.latitude && loc.longitude) {
                        await findNearbyHospitals(loc.latitude, loc.longitude);
                    } else {
                        alert('Unable to determine your location. Please allow location access or enter your city in the search.');
                    }
                }, { enableHighAccuracy: true, timeout: 10000 });
                return;
            } else {
                const loc = await getIpLocation();
                if (loc && loc.latitude && loc.longitude) {
                    lat = loc.latitude; lon = loc.longitude;
                } else {
                    alert('Geolocation is not available in your browser.');
                    return;
                }
            }
        }

        const response = await fetch('/api/hospitals/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lon })
        });
        const data = await response.json();
        if (data.success) {
            // Detect if server returned sample fallback (sample uses lat ~37.7749 in sample_hospitals.json)
            const isSample = (data.hospitals || []).some(h => Math.abs((h.lat || 0) - 37.7749) < 0.0001 && Math.abs((h.lon || 0) - (-122.4194)) < 0.0001);
            if (isSample) {
                console.warn('Backend returned sample fallback hospitals (San Francisco). Attempting client-side Overpass fallback.');
                showSampleWarning();
                // Try client-side Overpass lookup as a fallback
                try {
                    const remote = await fetchOverpassDirect(lat, lon, 30000);
                    if (remote && remote.length) {
                        clearSampleWarning();
                        displayHospitals(remote);
                        return;
                    }
                } catch (e) {
                    console.warn('Client-side Overpass fallback failed:', e);
                }
            } else {
                clearSampleWarning();
            }
            console.log('Hospital API response:', data);
            displayHospitals(data.hospitals);
        } else {
            console.error('Hospital API returned an error:', data);
            alert('Failed to fetch nearby hospitals.');
        }
    } catch (error) {
        console.error('Error fetching hospitals:', error);
        alert('Error fetching nearby hospitals. Check console for details.');
    }
}

// Client-side Overpass fallback: query public Overpass mirrors directly from the browser
async function fetchOverpassDirect(lat, lon, radius = 30000) {
    const query = `
        [out:json];
        (
            node["amenity"="hospital"](around:${radius},${lat},${lon});
            way["amenity"="hospital"](around:${radius},${lat},${lon});
            node["amenity"="clinic"](around:${radius},${lat},${lon});
            way["amenity"="clinic"](around:${radius},${lat},${lon});
        );
        out body;
        >;
        out skel qt;
    `;

    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.openstreetmap.fr/api/interpreter'
    ];

    for (const endpoint of endpoints) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: query
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            if (!data || !data.elements) continue;
            const hospitals = data.elements
                .filter(el => el.tags && el.tags.name)
                .map(el => ({
                    name: el.tags.name,
                    type: el.tags.amenity || el.tags.healthcare || 'hospital',
                    address: el.tags['addr:street'] || el.tags['addr:full'] || el.tags['addr:housenumber'] || 'Address not available',
                    phone: el.tags.phone || el.tags.telephone || 'N/A',
                    lat: el.lat,
                    lon: el.lon,
                    tags: el.tags || {},
                    distance: calculateDistance(lat, lon, el.lat, el.lon)
                }));
            hospitals.sort((a, b) => a.distance - b.distance);
            return hospitals.slice(0, 20);
        } catch (e) {
            console.warn('Overpass direct fetch failed for', endpoint, e);
        }
    }

    return [];
}

// Show / clear visible warning when sample fallback is used
function showSampleWarning() {
    let banner = document.getElementById('sampleWarning');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sampleWarning';
        banner.style.cssText = 'background:#f97316;color:white;padding:8px;border-radius:6px;margin:8px 0;text-align:center;font-weight:600;';
        banner.textContent = 'Warning: The results shown are fallback/sample data (not local). Please allow location access or disable VPN and try again.';
        const container = document.querySelector('#hospitalMapSection .section-container') || document.getElementById('hospitalMapSection');
        if (container) container.insertBefore(banner, container.firstChild);
    }
}

function clearSampleWarning() {
    const banner = document.getElementById('sampleWarning');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
}

// Center-on-user helper that re-requests high-accuracy geolocation
function centerOnUser() {
    if (!navigator.geolocation) {
        alert('Geolocation not available in this browser.');
        return;
    }
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        if (AppState.map) {
            AppState.map.setView([latitude, longitude], 14);
            if (AppState.userMarker) AppState.userMarker.setLatLng([latitude, longitude]).bindPopup('You are here 📍').openPopup();
        }
        findNearbyHospitals(latitude, longitude);
    }, err => {
        console.warn('Center-on-user geolocation failed:', err);
        alert('Could not access precise location. Please allow location access in your browser.');
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function displayHospitals(hospitals) {
    // Clear previous markers
    AppState.hospitalMarkers.forEach(m => AppState.map.removeLayer(m));
    AppState.hospitalMarkers = [];

    // Define red icon for markers
    const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    hospitals.forEach((hospital, idx) => {
        const marker = L.marker([hospital.lat, hospital.lon], { icon: redIcon })
            .addTo(AppState.map)
            .bindPopup(`<b>🏥 ${hospital.name}</b><br>${hospital.address}<br><b>Distance:</b> ${hospital.distance}m`);

        // When marker is clicked, fetch Wikipedia summary + Groq explanation
        marker.on('click', async () => {
            try {
                const resp = await fetch('/api/hospitals/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: hospital.name, lat: hospital.lat, lon: hospital.lon })
                });
                const info = await resp.json();
                if (info.success) {
                    const wiki = info.wikipedia;
                    const summary = wiki?.extract || 'No Wikipedia summary available.';
                    const explanation = info.explanation || 'No explanation available.';

                    // Show a concise modal-like alert with info (replace with a nicer UI later)
                    const message = `${hospital.name}\n\nWikipedia:\n${summary}\n\nExplanation:\n${explanation}`;
                    // Use a simple popup window for now
                    window.open('', '_blank').document.write(`<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>`);
                } else {
                    alert('No additional info available');
                }
            } catch (err) {
                console.error('Error fetching hospital info:', err);
                alert('Failed to fetch additional hospital info');
            }
        });

        AppState.hospitalMarkers.push(marker);
    });
}

function generateParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    
    const codeSymbols = ['{', '}', '[', ']', '(', ')', '<', '>', '/', '*', '=', '+', '-', ';', ':', '&', '|', '%', '$', '#', '@'];
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.textContent = codeSymbols[Math.floor(Math.random() * codeSymbols.length)];
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        particlesContainer.appendChild(particle);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    generateParticles();
});



//--------------animations.js-----------------
function inView(element, callback, options = {}) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                callback(entry);
                if (options.once !== false) {
                    observer.unobserve(entry.target);
                }
            }
        });
    }, {
        threshold: options.amount || 0.1,
        rootMargin: options.rootMargin || '0px'
    });
    observer.observe(element);
    return () => observer.unobserve(element);
}

function animateElement(element, props, options = {}) {
    if (typeof anime === 'undefined') return;
    const animeProps = {};
    if (props.opacity) animeProps.opacity = props.opacity;
    if (props.x !== undefined) animeProps.translateX = props.x;
    if (props.y !== undefined) animeProps.translateY = props.y;
    if (props.scale) animeProps.scale = props.scale;
    return anime({
        targets: element,
        ...animeProps,
        duration: (options.duration || 0.8) * 1000,
        delay: (options.delay || 0) * 1000,
        easing: options.easing || 'easeOutExpo'
    });
}

window.addEventListener('load', () => {
    setTimeout(() => {
        initLoaderAnimation();
    }, 100);
});

function initLoaderAnimation() {
    const loader = document.getElementById('loader');
    const loaderPercent = document.getElementById('loaderPercent');
    if (!loader || !loaderPercent) return;
    
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            setTimeout(() => {
                if (typeof anime !== 'undefined') {
                    anime({
                        targets: loader,
                        opacity: [1, 0],
                        duration: 500,
                        easing: 'easeInOutQuad',
                        complete: () => {
                            loader.classList.add('hidden');
                            initPageAnimations();
                        }
                    });
                } else {
                    loader.classList.add('hidden');
                    initPageAnimations();
                }
            }, 300);
        }
        if (loaderPercent) {
            loaderPercent.textContent = Math.floor(progress) + '%';
        }
    }, 100);
}

function initPageAnimations() {
    setTimeout(() => {
        initHeroAnimations();
        initSkillAnimations();
        initTimelineAnimations();
        initProjectAnimations();
        initScrollAnimations();
        initContactAnimations();
        animateStats();
        initParallax();
        initSmoothScroll();
    }, 300);
}

function initHeroAnimations() {
    if (typeof anime === 'undefined') return;
    
    const heroName = document.getElementById('heroName');
    if (heroName) {
        const nameValue = heroName.querySelector('.name-value');
        if (nameValue) {
            const originalText = nameValue.textContent;
            nameValue.textContent = '';
            anime({
                targets: { value: 0 },
                value: originalText.length,
                duration: 1500,
                delay: 500,
                easing: 'easeInOutQuad',
                update: function(anim) {
                    const length = Math.floor(anim.animatables[0].target.value);
                    nameValue.textContent = originalText.substring(0, length);
                },
                complete: () => {
                    const cursor = document.createElement('span');
                    cursor.className = 'name-cursor';
                    cursor.textContent = '|';
                    cursor.style.animation = 'blink 1s infinite';
                    nameValue.appendChild(cursor);
                    setTimeout(() => cursor.remove(), 2000);
                }
            });
        }
    }
    
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
        anime({
            targets: heroTitle,
            opacity: [0, 1],
            translateX: [-30, 0],
            delay: 800,
            duration: 1000,
            easing: 'easeOutExpo'
        });
    }
    
    const heroDescription = document.querySelector('.hero-description');
    if (heroDescription) {
        anime({
            targets: heroDescription,
            opacity: [0, 1],
            translateY: [20, 0],
            delay: 1200,
            duration: 1000,
            easing: 'easeOutExpo'
        });
    }
    
    const heroButtons = document.querySelectorAll('.hero-buttons .btn');
    if (heroButtons.length > 0) {
        anime({
            targets: heroButtons,
            opacity: [0, 1],
            scale: [0.8, 1],
            delay: anime.stagger(100, {start: 1500}),
            duration: 800,
            easing: 'easeOutBack'
        });
    }
    
    const socialIcons = document.querySelectorAll('.hero-social .social-icon');
    if (socialIcons.length > 0) {
        anime({
            targets: socialIcons,
            opacity: [0, 1],
            scale: [0, 1],
            rotate: [180, 0],
            delay: anime.stagger(100, {start: 2000}),
            duration: 800,
            easing: 'easeOutBack'
        });
    }
    
    const profileImage = document.getElementById('profileImage');
    if (profileImage) {
        anime({
            targets: profileImage,
            opacity: [0, 1],
            scale: [0.8, 1],
            rotate: [180, 0],
            delay: 1000,
            duration: 1500,
            easing: 'easeOutElastic(1, .8)'
        });
        
        profileImage.addEventListener('mouseenter', () => {
            anime({
                targets: profileImage,
                scale: [1, 1.1],
                rotate: [0, 5],
                duration: 500,
                easing: 'easeOutElastic(1, .8)'
            });
        });
        
        profileImage.addEventListener('mouseleave', () => {
            anime({
                targets: profileImage,
                scale: [1.1, 1],
                rotate: [5, 0],
                duration: 500,
                easing: 'easeOutElastic(1, .8)'
            });
        });
    }
    
    const badges = document.querySelectorAll('.floating-badge');
    if (badges.length > 0) {
        badges.forEach((badge, index) => {
            anime({
                targets: badge,
                opacity: [0, 1],
                scale: [0, 1],
                delay: 1500 + (index * 200),
                duration: 800,
                easing: 'easeOutBack'
            });
        });
    }
}

function initSkillAnimations() {
    const skillsSection = document.getElementById('skills');
    if (!skillsSection) return;
    
    const skillItems = skillsSection.querySelectorAll('.skill-item');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const skillItem = entry.target;
                const progressBar = skillItem.querySelector('.skill-progress');
                const percentElement = skillItem.querySelector('.skill-percent');
                const percent = parseInt(skillItem.getAttribute('data-percent') || 0);
                
                if (progressBar && typeof anime !== 'undefined') {
                    anime({
                        targets: progressBar,
                        width: ['0%', percent + '%'],
                        duration: 2000,
                        easing: 'easeOutExpo',
                        delay: 300
                    });
                    
                    anime({
                        targets: { value: 0 },
                        value: percent,
                        duration: 2000,
                        easing: 'easeOutExpo',
                        delay: 300,
                        update: function(anim) {
                            if (percentElement) {
                                percentElement.textContent = Math.floor(anim.animatables[0].target.value) + '%';
                            }
                        }
                    });
                }
                observer.unobserve(skillItem);
            }
        });
    }, { threshold: 0.5 });
    
    skillItems.forEach(item => observer.observe(item));
}

function initTimelineAnimations() {
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach((item, index) => {
        inView(item, () => {
            if (typeof anime !== 'undefined') {
                anime({
                    targets: item,
                    opacity: [0, 1],
                    translateX: [-50, 0],
                    delay: index * 150,
                    duration: 1000,
                    easing: 'easeOutExpo'
                });
            } else {
                animateElement(item, { opacity: [0, 1], x: [-50, 0] }, { duration: 0.8, delay: index * 0.1 });
            }
        }, { amount: 0.3 });
    });
}

function initProjectAnimations() {
    const projectCards = document.querySelectorAll('.project-card');
    projectCards.forEach((card, index) => {
        inView(card, () => {
            if (typeof anime !== 'undefined') {
                anime({
                    targets: card,
                    opacity: [0, 1],
                    translateY: [50, 0],
                    scale: [0.9, 1],
                    delay: index * 100,
                    duration: 1000,
                    easing: 'easeOutExpo'
                });
            } else {
                animateElement(card, { opacity: [0, 1], y: [50, 0], scale: [0.9, 1] }, { duration: 0.8, delay: index * 0.1 });
            }
        }, { amount: 0.2 });
        
        card.addEventListener('mouseenter', () => {
            if (typeof anime !== 'undefined') {
                anime({ targets: card, scale: [1, 1.02], duration: 300, easing: 'easeOutQuad' });
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (typeof anime !== 'undefined') {
                anime({ targets: card, scale: [1.02, 1], duration: 300, easing: 'easeOutQuad' });
            }
        });
    });
}

function initScrollAnimations() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        inView(section, () => {
            const sectionHeader = section.querySelector('.section-header');
            if (sectionHeader && typeof anime !== 'undefined') {
                anime({
                    targets: sectionHeader,
                    opacity: [0, 1],
                    translateY: [-20, 0],
                    duration: 600,
                    easing: 'easeOutExpo'
                });
            }
        }, { amount: 0.2 });
    });
    
    const cards = document.querySelectorAll('.card, .project-card, .contact-item');
    cards.forEach((card, index) => {
        inView(card, () => {
            if (typeof anime !== 'undefined') {
                anime({
                    targets: card,
                    opacity: [0, 1],
                    translateY: [30, 0],
                    delay: index * 30,
                    duration: 500,
                    easing: 'easeOutExpo'
                });
            } else {
                animateElement(card, { opacity: [0, 1], y: [50, 0] }, { duration: 0.6, delay: index * 0.05 });
            }
        }, { amount: 0.2 });
    });
}

function animateStats() {
    // Stats in the about section are now text-based (e.g., "24/7", "Instant", "AI")
    // No numeric animation needed - they appear as-is with fade-in effect
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(stat => {
        inView(stat, () => {
            // Simple fade-in animation for text-based stats
            if (typeof anime !== 'undefined') {
                anime({
                    targets: stat,
                    opacity: [0, 1],
                    scale: [0.8, 1],
                    duration: 800,
                    easing: 'easeOutExpo'
                });
            }
        }, { amount: 0.5 });
    });
}

function initContactAnimations() {
    const contactItems = document.querySelectorAll('.contact-item');
    contactItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            if (typeof anime !== 'undefined') {
                anime({ targets: item, scale: [1, 1.02], duration: 200, easing: 'easeOutQuad' });
            }
        });
        item.addEventListener('mouseleave', () => {
            if (typeof anime !== 'undefined') {
                anime({ targets: item, scale: [1.02, 1], duration: 200, easing: 'easeOutQuad' });
            }
        });
    });
}

function initParallax() {
    const profileImage = document.getElementById('profileImage');
    if (!profileImage) return;
    
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                const parallaxSpeed = 0.3;
                const maxOffset = 100;
                const offset = Math.min(scrolled * parallaxSpeed, maxOffset);
                
                if (profileImage) {
                    profileImage.style.transform = `translateY(${offset}px)`;
                }
                
                const gridBg = document.querySelector('.code-grid-bg');
                if (gridBg) {
                    gridBg.style.transform = `translateY(${scrolled * 0.2}px)`;
                }
                
                ticking = false;
            });
            ticking = true;
        }
    });
}

function initSmoothScroll() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const headerHeight = document.querySelector('.main-header').offsetHeight;
                const targetPosition = targetSection.offsetTop - headerHeight;
                
                if (typeof anime !== 'undefined') {
                    anime({
                        targets: window,
                        scrollTop: targetPosition,
                        duration: 800,
                        easing: 'easeInOutQuad'
                    });
                } else {
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    let currentSection = '';
    window.addEventListener('scroll', () => {
        const scrollPos = window.scrollY + 150;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                if (currentSection !== sectionId) {
                    currentSection = sectionId;
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${sectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            }
        });
    });
}

window.Animations = {
    initParallax,
    initSmoothScroll
};
