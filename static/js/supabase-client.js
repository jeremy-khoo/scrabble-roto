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
  
  // Try multiple selectors for the login link
  let loginLink = document.querySelector('a[href="/login/"]') || 
                  document.querySelector('a[href*="login"]') ||
                  Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Login' || a.textContent.includes('Logged in as'));
  
  // If login link not found and DOM isn't ready, wait a tiny bit
  if (!loginLink && document.readyState !== 'complete') {
    await new Promise(resolve => setTimeout(resolve, 50));
    loginLink = document.querySelector('a[href="/login/"]') || 
                document.querySelector('a[href*="login"]') ||
                Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Login' || a.textContent.includes('Logged in as'));
  }
  
  const createTeamLink = document.querySelector('a[href="/create-team/"]') ||
                        document.querySelector('a[href*="create-team"]');
  const adminLink = document.querySelector('a[href="/admin/"]') ||
                   document.querySelector('a[href*="admin"]');
  
  console.log('updateAuthUI called, isAuthenticated:', isAuthenticated);
  console.log('loginLink found:', loginLink);
  
  // Clean up any existing logout buttons first
  document.querySelectorAll('#logout-btn, [data-logout-btn]').forEach(btn => btn.remove());

  if (isAuthenticated) {
    // Get user profile for username
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", currentUser.id)
        .single();

      // Update login link to show logged in status
      if (loginLink) {
        console.log('Updating login link text to:', `Logged in as ${profile?.username || currentUser.email}`);
        loginLink.textContent = `Logged in as ${profile?.username || currentUser.email}`;
        loginLink.href = "#";
        loginLink.onclick = (e) => e.preventDefault(); // Make it non-clickable
        loginLink.style.color = "#666";
        loginLink.style.cursor = "default";
      } else {
        console.log('Login link not found!');
      }

      // Create logout button
      if (loginLink) {
        const logoutBtn = document.createElement('a');
        logoutBtn.id = 'logout-btn';
        logoutBtn.setAttribute('data-logout-btn', 'true');
        logoutBtn.href = '#';
        logoutBtn.textContent = 'Logout';
        logoutBtn.onclick = (e) => {
          e.preventDefault();
          logout();
        };
        
        // Insert logout button after login link
        loginLink.parentNode.insertBefore(logoutBtn, loginLink.nextSibling);
      }

      // Show protected links
      if (createTeamLink) {
        createTeamLink.style.display = "block";
      }

      // Show/hide admin link
      if (adminLink) {
        if (profile?.is_admin) {
          adminLink.style.display = "block";
        } else {
          adminLink.style.display = "none";
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      if (loginLink) {
        loginLink.textContent = `Logged in as ${currentUser.email}`;
        loginLink.href = "#";
        loginLink.onclick = (e) => e.preventDefault();
        loginLink.style.color = "#666";
        loginLink.style.cursor = "default";
      }
      if (adminLink) adminLink.style.display = "none";
    }
  } else {
    // Reset to login state
    if (loginLink) {
      loginLink.textContent = "Login";
      loginLink.href = "/login/";
      loginLink.onclick = null;
      loginLink.style.color = "";
      loginLink.style.cursor = "";
    }
    
    // Remove all logout buttons
    document.querySelectorAll('#logout-btn, [data-logout-btn]').forEach(btn => btn.remove());

    // Hide protected links only if we're certain user is not authenticated
    // Add a small delay to prevent hiding links while user is trying to click
    setTimeout(() => {
      if (createTeamLink && currentUser === null) {
        createTeamLink.style.display = "none";
      }
      if (adminLink && currentUser === null) {
        adminLink.style.display = "none";
      }
    }, 100);
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
  // Ensure menu links are visible by default before auth check
  const createTeamLink = document.querySelector('a[href="/create-team/"]') ||
                        document.querySelector('a[href*="create-team"]');
  const adminLink = document.querySelector('a[href="/admin/"]') ||
                   document.querySelector('a[href*="admin"]');
  
  if (createTeamLink) {
    createTeamLink.style.display = "";
  }
  if (adminLink) {
    adminLink.style.display = "";
  }
  
  // Then check auth
  initAuth();
});
