import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '@/api'

export interface User {
  id: string
  username: string
  email: string
  role: string
  tenant?: string | null
  tenant_name?: string | null
  language?: string
  currency?: string
  first_name?: string
  last_name?: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionChecked: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionChecked: false,
  error: null,
}

function authErrorMessage(error: unknown): string {
  const err = error as {
    response?: { data?: { detail?: string; non_field_errors?: string[] } }
  }
  const data = err.response?.data
  if (typeof data?.detail === 'string') return data.detail
  if (data?.non_field_errors?.[0]) return data.non_field_errors[0]
  return 'Login failed'
}

export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      await authApi.login(username, password)
      const me = await authApi.getMe()
      return me.data
    } catch (error: unknown) {
      return rejectWithValue(authErrorMessage(error))
    }
  },
)

export const loginWithPin = createAsyncThunk(
  'auth/loginWithPin',
  async ({ username, pin }: { username: string; pin: string }, { rejectWithValue }) => {
    try {
      await authApi.loginWithPin(username, pin)
      const me = await authApi.getMe()
      return me.data
    } catch (error: unknown) {
      return rejectWithValue(authErrorMessage(error))
    }
  },
)

export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getMe()
      return response.data
    } catch {
      return rejectWithValue('No active session')
    }
  },
)

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await authApi.logout()
  } catch {
    // Clear local state even if server call fails
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setWorkshopLanguage: (state, action: PayloadAction<string>) => {
      if (state.user) {
        state.user.language = action.payload
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<User>) => {
        state.isLoading = false
        state.sessionChecked = true
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.sessionChecked = true
        state.error = action.payload as string
      })
      .addCase(loginWithPin.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(loginWithPin.fulfilled, (state, action: PayloadAction<User>) => {
        state.isLoading = false
        state.sessionChecked = true
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(loginWithPin.rejected, (state, action) => {
        state.isLoading = false
        state.sessionChecked = true
        state.error = action.payload as string
      })
      .addCase(restoreSession.pending, (state) => {
        state.isLoading = true
      })
      .addCase(restoreSession.fulfilled, (state, action: PayloadAction<User>) => {
        state.isLoading = false
        state.sessionChecked = true
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isLoading = false
        state.sessionChecked = true
        state.isAuthenticated = false
        state.user = null
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
        state.error = null
        state.sessionChecked = true
        state.isLoading = false
      })
  },
})

export const { clearError, setWorkshopLanguage } = authSlice.actions
export default authSlice.reducer
