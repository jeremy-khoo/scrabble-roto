// Supabase client configuration
// You'll need to replace these with your actual Supabase project credentials
const SUPABASE_URL = "https://pnlzyjffhjnxdibedjmd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GffUYOiDOHqkN1lsF3QTow_AoMblKwH";

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

      // Show user info
      if (authUserInfo && authUserDisplay) {
        authUserDisplay.textContent = `Logged in as ${profile?.username || currentUser.email}`;
        authUserInfo.style.display = 'flex';
        console.log('Set authUserInfo to display: flex');
      }

      // Hide login menu item
      if (loginMenu) {
        loginMenu.style.display = 'none';
        console.log('Set loginMenu to display: none');
      }

      // Show create team menu
      if (createTeamMenu) {
        createTeamMenu.style.display = 'block';
        console.log('Set createTeamMenu to display: block');
      }

      // Show/hide admin menu based on permissions
      if (adminMenu) {
        if (profile?.is_admin) {
          adminMenu.style.display = 'block';
          console.log('Set adminMenu to display: block (admin user)');
        } else {
          adminMenu.style.display = 'none';
          console.log('Set adminMenu to display: none (not admin)');
        }
      }

    } catch (error) {
      console.error("Error loading profile:", error);
      
      // Fallback - show basic user info
      if (authUserInfo && authUserDisplay) {
        authUserDisplay.textContent = `Logged in as ${currentUser.email}`;
        authUserInfo.style.display = 'flex';
      }
      
      if (loginMenu) loginMenu.style.display = 'none';
      if (createTeamMenu) createTeamMenu.style.display = 'block';
      if (adminMenu) adminMenu.style.display = 'none';
    }
  } else {
    // User is logged out
    console.log('Setting logged out state');
    
    // Hide user info
    if (authUserInfo) {
      authUserInfo.style.display = 'none';
      console.log('Set authUserInfo to display: none');
    }
    
    // Show login menu
    if (loginMenu) {
      loginMenu.style.display = 'block';
      console.log('Set loginMenu to display: block');
    }
    
    // Hide protected menus
    if (createTeamMenu) {
      createTeamMenu.style.display = 'none';
      console.log('Set createTeamMenu to display: none');
    }
    
    if (adminMenu) {
      adminMenu.style.display = 'none';
      console.log('Set adminMenu to display: none');
    }
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
    
    // Set initial states - everything starts hidden/visible appropriately
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
    
    // Set default states
    if (authUserInfo) authUserInfo.style.display = 'none';
    if (loginMenu) loginMenu.style.display = 'block';
    if (createTeamMenu) createTeamMenu.style.display = 'none';
    if (adminMenu) adminMenu.style.display = 'none';
    
    // Then check auth
    initAuth();
  }, 100);
});
