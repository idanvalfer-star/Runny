import { supabase } from './supabase'
import { db } from '../db/schema'
import type { Activity } from '../types'

export async function pushActivityToCloud(activity: Activity, userId: string) {
  const { error } = await supabase
    .from('activities')
    .upsert({
      id: activity.id,
      user_id: userId,
      type: activity.type,
      start_time: activity.startTime,
      end_time: activity.endTime,
      distance_km: activity.distanceKm,
      duration_sec: activity.elapsedTimeSec,
      moving_time_sec: activity.movingTimeSec,
      avg_pace_sec_per_km: activity.avgPaceSecPerKm,
      best_pace_sec_per_km: activity.bestPaceSecPerKm,
      calories_burned: activity.caloriesBurned,
      elevation_gain_m: activity.elevationGainM,
      elevation_loss_m: activity.elevationLossM,
      avg_hr: activity.avgHr,
      max_hr: activity.maxHr,
      rpe: activity.rpe,
      pain_reported: activity.painReported,
      pain_note: activity.painNote,
      route_json: JSON.stringify(activity.route),
      hr_samples_json: JSON.stringify(activity.hrSamples),
      splits_json: JSON.stringify(activity.splits),
      created_at: new Date(activity.startTime).toISOString(),
    })

  if (error) {
    console.error('Error syncing activity to cloud:', error)
    throw error
  }
}

export async function pullActivitiesFromCloud(userId: string) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('Error pulling activities from cloud:', error)
    throw error
  }

  return data
}

export async function migrateLocalDataToCloud(userId: string) {
  // Get all local activities
  const activities = await db.activities.toArray()

  if (activities.length === 0) {
    return
  }

  console.log(`Migrating ${activities.length} activities to cloud...`)

  for (const activity of activities) {
    try {
      await pushActivityToCloud(activity, userId)
    } catch (err) {
      console.error(`Failed to migrate activity ${activity.id}:`, err)
    }
  }

  console.log('Migration complete')
}

export async function syncActivityOnSave(activity: Activity, userId: string) {
  if (!userId) {
    console.log('No user ID, skipping cloud sync')
    return
  }

  try {
    await pushActivityToCloud(activity, userId)
  } catch (err) {
    console.error('Sync failed, activity saved locally:', err)
  }
}
