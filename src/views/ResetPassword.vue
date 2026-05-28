<template>
  <section class="reset-password-page">
    <div class="reset-password-panel">
      <div class="reset-password-header">
        <span class="material-icons">lock_reset</span>
        <h1>{{ t('auth.resetPassword') }}</h1>
        <p>{{ t('auth.resetPasswordDescription') }}</p>
      </div>

      <form class="reset-password-form" @submit.prevent="submitResetPassword">
        <label class="reset-password-field">
          <span>{{ t('auth.newPassword') }}</span>
          <input v-model="password" type="password" autocomplete="new-password" data-testid="reset-password-new" />
        </label>

        <label class="reset-password-field">
          <span>{{ t('auth.confirmPassword') }}</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" data-testid="reset-password-confirm" />
        </label>

        <div v-if="error" class="reset-password-error" data-testid="reset-password-error">{{ error }}</div>

        <button
          class="reset-password-button"
          type="submit"
          :class="{ loading: submitting }"
          :disabled="submitting"
          :aria-busy="submitting"
          data-testid="reset-password-submit"
        >
          <span :class="['material-icons', { 'reset-password-loading': submitting }]">{{ submitting ? 'sync' : 'check_circle' }}</span>
          <span>{{ t('auth.resetPasswordSubmit') }}</span>
        </button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/store/authStore'
import { getLocalizedApiErrorMessage } from '@/api/authErrors'
import { useI18n } from '@/i18n'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const error = ref('')

const resetToken = computed(() => {
  const token = route.query.token
  return typeof token === 'string' ? token.trim() : ''
})

const submitResetPassword = async () => {
  error.value = ''

  if (!resetToken.value) {
    error.value = t('auth.resetPasswordMissingToken')
    return
  }
  if (password.value.length < 8) {
    error.value = t('auth.invalidPassword')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.resetPasswordMismatch')
    return
  }

  submitting.value = true
  try {
    await authStore.confirmPasswordReset({
      token: resetToken.value,
      password: password.value
    })
    password.value = ''
    confirmPassword.value = ''
    message.success(t('auth.resetPasswordSuccess'))
    await router.replace('/home')
  } catch (err) {
    error.value = getLocalizedApiErrorMessage(err, t, 'auth.failed')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.reset-password-page {
  min-height: calc(100vh - 160px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}

.reset-password-panel {
  width: min(100%, 430px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  box-shadow: var(--shadow-sm);
  padding: 24px;
}

.reset-password-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 22px;
}

.reset-password-header .material-icons {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary-color);
  font-size: 24px;
}

.reset-password-header h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1.25;
}

.reset-password-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.reset-password-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.reset-password-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.reset-password-field input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  font-size: 14px;
}

.reset-password-field input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-ring);
}

.reset-password-error {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-color);
  color: var(--danger-color);
  background: var(--danger-soft);
  font-size: 13px;
}

.reset-password-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-md);
  color: #fff;
  background: var(--primary-color);
  font-weight: 700;
  cursor: pointer;
}

.reset-password-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.reset-password-button .material-icons {
  font-size: 18px;
}

.reset-password-loading {
  animation: reset-password-spin 0.9s linear infinite;
}

@keyframes reset-password-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
