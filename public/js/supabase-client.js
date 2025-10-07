// Supabase client configuration
// You'll need to replace these with your actual Supabase project credentials
const SUPABASE_URL = "https://fzvjywxyhrmypgnculhm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dmp5d3h5aHJteXBnbmN1bGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MTc2MjQsImV4cCI6MjA3NTI5MzYyNH0.hWcwQTyLczIZ_NM6RSXQNt36v-CeF3YqWj75aOrb0rQ";

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth state management
let currentUser = null;

// Initialize auth state
async function initAuth() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      updateAuthUI(true);
    } else {
      currentUser = null;
      updateAuthUI(false);
    }
  } catch (error) {
    console.error("Auth initialization error:", error);
    // On error, don't hide links - let user try to use them
  }
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth event:", event);
  if (session) {
    currentUser = session.user;
    updateAuthUI(true);

    // Redirect to teams page after login
    if (window.location.pathname === "/login/") {
      window.location.href = "/teams/";
    }
  } else {
    currentUser = null;
    updateAuthUI(false);
  }
});

// Track if we're already updating to prevent multiple calls
let isUpdatingAuth = false;

// Update UI based on auth state
async function updateAuthUI(isAuthenticated) {
  // Prevent multiple simultaneous updates
  if (isUpdatingAuth) return;
  isUpdatingAuth = true;
  
  console.log('updateAuthUI called, isAuthenticated:', isAuthenticated);
  
  // Get elements using the new IDs from our custom header
  const authUserInfo = document.getElementById('authUserInfo');
  const authUserDisplay = document.getElementById('authUserDisplay');
  const loginMenu = document.getElementById('menu-item-login');
  const createTeamMenu = document.getElementById('menu-item-create-team');
  const adminMenu = document.getElementById('menu-item-admin');
  
  console.log('Elements found:', {
    authUserInfo: !!authUserInfo,
    authUserDisplay: !!authUserDisplay,
    loginMenu: !!loginMenu,
    createTeamMenu: !!createTeamMenu,
    adminMenu: !!adminMenu
  });
  
  if (isAuthenticated && currentUser) {
    try {
      // Get user profile for username and admin status
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", currentUser.id)
        .single();

      console.log('Profile loaded:', profile);

      // Show user info with smooth transition
      if (authUserInfo && authUserDisplay) {
        authUserDisplay.textContent = `Logged in as ${profile?.username || currentUser.email}`;
        authUserInfo.className = 'user-info fade-in';
        authUserInfo.style.display = 'flex';
        console.log('Set authUserInfo to display: flex with fade-in');
      }

      // Hide/show menu items with smooth transitions
      setMenuItemState(loginMenu, 'hidden-smooth');
      setMenuItemState(createTeamMenu, 'visible-smooth');
      
      // Show/hide admin menu based on permissions
      if (profile?.is_admin) {
        setMenuItemState(adminMenu, 'visible-smooth');
        console.log('Set adminMenu to visible (admin user)');
      } else {
        setMenuItemState(adminMenu, 'hidden-smooth');
        console.log('Set adminMenu to hidden (not admin)');
      }

    } catch (error) {
      console.error("Error loading profile:", error);
      
      // Fallback - show basic user info with smooth transition
      if (authUserInfo && authUserDisplay) {
        authUserDisplay.textContent = `Logged in as ${currentUser.email}`;
        authUserInfo.className = 'user-info fade-in';
        authUserInfo.style.display = 'flex';
      }
      
      setMenuItemState(loginMenu, 'hidden-smooth');
      setMenuItemState(createTeamMenu, 'visible-smooth');
      setMenuItemState(adminMenu, 'hidden-smooth');
    }
  } else {
    // User is logged out
    console.log('Setting logged out state with smooth transitions');
    
    // Hide user info with fade out
    if (authUserInfo) {
      authUserInfo.className = 'user-info fade-out';
      setTimeout(() => {
        if (authUserInfo.classList.contains('fade-out')) {
          authUserInfo.style.display = 'none';
        }
      }, 300);
      console.log('Set authUserInfo to fade out');
    }
    
    // Show/hide menu items with smooth transitions
    setMenuItemState(loginMenu, 'visible-smooth');
    setMenuItemState(createTeamMenu, 'hidden-smooth');
    setMenuItemState(adminMenu, 'hidden-smooth');
  }
  
  // Reset the flag
  isUpdatingAuth = false;
}

// Auth functions
async function signUp(email, password, username) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
        },
      },
    });

    if (error) throw error;

    // Create profile
    if (data.user) {
      await createProfile(data.user.id, username, email);
    }

    return { success: true, data };
  } catch (error) {
    console.error("Sign up error:", error);
    return { success: false, error: error.message };
  }
}

async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error("Sign in error:", error);
    return { success: false, error: error.message };
  }
}

async function logout() {
  try {
    await supabase.auth.signOut();
    window.location.href = "/";
  } catch (error) {
    console.error("Logout error:", error);
  }
}

async function createProfile(userId, username, email) {
  try {
    const { error } = await supabase
      .from("profiles")
      .insert([{ id: userId, username: username, email: email }]);

    if (error) throw error;
  } catch (error) {
    console.error("Profile creation error:", error);
  }
}

// Protect pages that require authentication
async function requireAuth() {
    // Wait for auth initialization if it hasn't completed yet
    if (currentUser === null) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                currentUser = session.user;
                return true;
            } else {
                window.location.href = '/login/';
                return false;
            }
        } catch (error) {
            console.error('Auth check error:', error);
            window.location.href = '/login/';
            return false;
        }
    }
    return true;
}

// Initialize when DOM loads
document.addEventListener("DOMContentLoaded", function() {
  // Wait a bit for all DOM elements to be ready
  setTimeout(() => {
    console.log('Initializing auth UI...');
    
    // Set initial loading states with smooth transitions
    const authUserInfo = document.getElementById('authUserInfo');
    const loginMenu = document.getElementById('menu-item-login');
    const createTeamMenu = document.getElementById('menu-item-create-team');
    const adminMenu = document.getElementById('menu-item-admin');
    
    console.log('Initial elements:', {
      authUserInfo: !!authUserInfo,
      loginMenu: !!loginMenu,
      createTeamMenu: !!createTeamMenu,
      adminMenu: !!adminMenu
    });
    
    // Check for existing auth token to show optimistic state
    const hasAuthToken = localStorage.getItem('supabase.auth.token') || 
                        sessionStorage.getItem('supabase.auth.token') ||
                        document.cookie.includes('sb-access-token') ||
                        window.location.hash.includes('access_token=');
    
    if (hasAuthToken) {
      // Likely logged in - show skeleton loading state
      if (authUserInfo) {
        authUserInfo.className = 'user-info skeleton';
        authUserInfo.innerHTML = '<span></span>'; // Empty skeleton
      }
      setMenuItemState(loginMenu, 'hidden-smooth');
      setMenuItemState(createTeamMenu, 'visible-smooth');
      setMenuItemState(adminMenu, 'hidden-smooth'); // Will be updated based on admin status
    } else {
      // Likely logged out - set logged out state smoothly
      if (authUserInfo) authUserInfo.className = 'user-info hidden-smooth';
      setMenuItemState(loginMenu, 'visible-smooth');
      setMenuItemState(createTeamMenu, 'hidden-smooth');
      setMenuItemState(adminMenu, 'hidden-smooth');
    }
    
    // Then check actual auth state
    initAuth();
  }, 50); // Reduced delay for faster perceived loading
});

// Helper function to set menu item states with smooth transitions
function setMenuItemState(element, state) {
  if (!element) return;
  
  element.className = `auth-dependent ${state}`;
  
  // For visibility, also handle display property for accessibility
  if (state === 'hidden-smooth') {
    setTimeout(() => {
      if (element.classList.contains('hidden-smooth')) {
        element.style.display = 'none';
      }
    }, 300); // Match CSS transition duration
  } else if (state === 'visible-smooth') {
    element.style.display = 'block';
  }
}
