import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { LocationDropdownsComponent } from '../../../shared/location-dropdowns/location-dropdowns.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule, LocationDropdownsComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  registrationSuccess = false;
  registrationError: string | null = null;

  constructor(private fb: FormBuilder, private http: HttpClient, private router: Router) {
    this.registerForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      provinceId: [null as string | null, Validators.required],
      cityId: [null as string | null, Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {}

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onProvinceChanged(provinceId: string | null): void {
    this.registerForm.get('provinceId')?.setValue(provinceId, { emitEvent: false });
    this.registerForm.get('cityId')?.setValue(null, { emitEvent: false });
    this.registerForm.get('provinceId')?.markAsDirty();
    this.registerForm.get('provinceId')?.markAsTouched();
    this.registerForm.get('cityId')?.markAsDirty();
    this.registerForm.get('cityId')?.markAsTouched();
  }

  onCityChanged(cityId: string | null): void {
    this.registerForm.get('cityId')?.setValue(cityId, { emitEvent: false });
    this.registerForm.get('cityId')?.markAsDirty();
    this.registerForm.get('cityId')?.markAsTouched();
  }

  async onSubmit(): Promise<void> {
    this.registrationSuccess = false;
    this.registrationError = null;

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.registrationError = 'Por favor, complete todos los campos requeridos y corrija los errores.';
      return;
    }

    const { name, email, password, cityId } = this.registerForm.value;
    try {
      await lastValueFrom(this.http.post('http://localhost:3000/auth/register', {
        name,
        email,
        password,
        cityId: parseInt(cityId, 10)
      }));
      this.registrationSuccess = true;
      this.registerForm.reset();
      this.registerForm.markAsUntouched();
      this.registerForm.markAsPristine();
      this.registerForm.get('provinceId')?.setValue(null, { emitEvent: false });
      this.registerForm.get('cityId')?.setValue(null, { emitEvent: false });
      
      // CAMBIO CLAVE AQUÍ: Asumiendo que el módulo Auth se carga en /auth
      this.router.navigate(['/auth/login']); 
    } catch (error: any) {
      console.error('Error en el registro:', error);
      this.registrationError = error.error?.message || 'Hubo un error al intentar registrar el usuario. Por favor, intente de nuevo.';
    }
  }
}