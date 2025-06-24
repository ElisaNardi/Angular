import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { debounceTime, distinctUntilChanged, catchError, filter, tap } from 'rxjs/operators';
import { of, Subscription, forkJoin, firstValueFrom } from 'rxjs';

import { GeorefService } from '../../../services/georef.service';
import { LocationPickerComponent, LocationSelectedEvent, GeorefAddressDetailsFromPicker } from '../../../shared/location-picker/location-picker.component';
import { RestaurantService, CreateRestaurantPayloadForService } from '../../../services/restaurant.service';
import { AuthService } from '../../../services/auth.service';

import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { LocationDropdownsComponent } from '../../../shared/location-dropdowns/location-dropdowns.component';

import {
  GeorefProvince,
  GeorefMunicipality,
  GeorefDireccion
} from '../../../models/georef-models';

interface RestaurantFormValue {
  name: string;
  imageUrl: string;
  description: string;
  address: {
    street: string;
    number: string;
    province: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

@Component({
  selector: 'app-add-restaurant',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LocationPickerComponent,
    LoadingSpinnerComponent,
    LocationDropdownsComponent
  ],
  templateUrl: './add-restaurant.component.html',
  styleUrls: ['./add-restaurant.component.css']
})
export class AddRestaurantComponent implements OnInit, OnDestroy, AfterViewInit {

  restaurantForm!: FormGroup;
  @ViewChild(LocationPickerComponent) locationPicker!: LocationPickerComponent;
  @ViewChild(LocationDropdownsComponent) locationDropdowns!: LocationDropdownsComponent;

  allProvinces: GeorefProvince[] = [];

  private subscriptions = new Subscription();
  private formListenersActive = true;

  isLoading = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;
  isEditMode = false;
  restaurantId: number | null = null;

  currentProvinceId: string | null = null;
  currentCityId: string | null = null;
  currentMunicipalityDetails: GeorefMunicipality | null = null;

  constructor(
    private fb: FormBuilder,
    private georefService: GeorefService,
    private restaurantService: RestaurantService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.checkEditMode();
  }

  ngAfterViewInit(): void {
    this.subscriptions.add(this.locationDropdowns.provincesLoaded.subscribe(provinces => {
      this.allProvinces = provinces;
      if (!this.isEditMode) {
        this.loadDefaultUserCity();
      } else if (this.restaurantId) {
        this.loadRestaurantData(this.restaurantId);
      }
      this.setupFormListeners();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initForm(): void {
    this.restaurantForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      imageUrl: ['', [Validators.required, Validators.pattern('https?://.+')]],
      description: ['', Validators.maxLength(500)],
      address: this.fb.group({
        street: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(100)]],
        number: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(/^[0-9]+$/), Validators.maxLength(20)]],
        province: [null as string | null, Validators.required],
        city: [{ value: null as string | null, disabled: true }, Validators.required],
        latitude: [null as number | null, Validators.required],
        longitude: [null as number | null, Validators.required],
      })
    });
  }

  async loadDefaultUserCity(): Promise<void> {
    const userCityId = String(this.authService.getLoggedInUserCityId());
    if (userCityId && this.locationDropdowns) {
      this.isLoading = true;
      try {
        const allMunicipalities = await firstValueFrom(this.georefService.getMunicipalities().pipe(
          catchError(error => {
            this.handleError('Error al cargar todos los municipios iniciales para usuario.', error);
            return of([]);
          })
        ));
        const defaultMunicipality = allMunicipalities.find(m => m.id === userCityId);

        if (defaultMunicipality && defaultMunicipality.centroide) {
          const lat = defaultMunicipality.centroide.lat;
          const lng = defaultMunicipality.centroide.lon;

          this.locationPicker.setMapCenterAndMarker(lat, lng, 15);

          const georefAddressForEvent: GeorefAddressDetailsFromPicker = {
            provinceId: defaultMunicipality.provincia.id,
            provinceName: defaultMunicipality.provincia.nombre,
            municipalityId: defaultMunicipality.id,
            municipalityName: defaultMunicipality.nombre,
            street: undefined,
            number: undefined
          };

          this.onLocationSelected({
            lat: lat,
            lng: lng,
            zoom: this.locationPicker?.map?.getZoom() || 13,
            georefAddress: georefAddressForEvent,
            fullGeorefResponse: undefined
          });

          await this.locationDropdowns.setDropdownValues(defaultMunicipality.provincia.id, defaultMunicipality.id, false);

          this.currentProvinceId = defaultMunicipality.provincia.id;
          this.currentCityId = defaultMunicipality.id;
          this.currentMunicipalityDetails = defaultMunicipality;
          this.restaurantForm.get('address.province')?.setValue(this.currentProvinceId, { emitEvent: false });
          this.restaurantForm.get('address.city')?.setValue(this.currentCityId, { emitEvent: false });
          this.toggleAddressFields(true);
        }
      } catch (err: any) {
        this.handleError('Error al cargar datos de ubicación iniciales del usuario.', err);
      } finally {
        this.isLoading = false;
      }
    }
  }

  public cleanName(name: string | null | undefined, type: 'province' | 'city'): string | null {
    if (!name) return null;
    let cleaned = name.trim();

    cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (type === 'province') {
      cleaned = cleaned.replace(/^provincia de /i, '');
      if (cleaned === 'ciudad autonoma de buenos aires') {
        return 'caba';
      }
    } else if (type === 'city') {
      cleaned = cleaned.replace(/^(municipio de |partido de |pedania |departamento |ciudad de |localidad |barrio |comision municipal de )/i, '');
      cleaned = cleaned.replace(/\s+-\s*capital$/i, '');
      cleaned = cleaned.replace(/\s*\(capital\)$/i, '');
      cleaned = cleaned.replace(/\s*central(?: de)?/i, '');
      cleaned = cleaned.replace(/\s*y localidades/i, '');
      cleaned = cleaned.replace(/\s*eje vial/i, '');
      cleaned = cleaned.replace(/\s*rural/i, '');
      cleaned = cleaned.replace(/^ciudad de\s/i, '');
      cleaned = cleaned.replace(/\s*\(.*\)$/, '');
    }

    cleaned = cleaned.replace(/^[-\s]+|[-\s]+$/g, '');

    if (type === 'city' && cleaned === 'capital federal') {
      return 'caba';
    }

    return cleaned.trim();
  }

  private checkEditMode(): void {
    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.isEditMode = true;
          this.restaurantId = +id;
        }
      })
    );
  }

  setupFormListeners(): void {
    const addressGroup = this.restaurantForm.get('address') as FormGroup;
    const streetControl = addressGroup.get('street');
    const numberControl = addressGroup.get('number');

    this.subscriptions.add(
      addressGroup.valueChanges.pipe(
        debounceTime(1000),
        distinctUntilChanged((prev, curr) => {
          return prev.street === curr.street &&
                 prev.number === curr.number &&
                 prev.province === curr.province &&
                 prev.city === curr.city;
        }),
        filter(() => this.formListenersActive &&
          !!this.locationPicker &&
          !!streetControl?.value &&
          !!numberControl?.value &&
          !!this.currentProvinceId &&
          !!this.currentCityId
        )
      ).subscribe(() => {
        this.geocodeManualAddress();
      })
    );
  }

  onDropdownProvinceChange(provinceId: string | null): void {
    this.currentProvinceId = provinceId;
    this.currentCityId = null;
    this.currentMunicipalityDetails = null;

    this.formListenersActive = false;
    this.restaurantForm.get('address.province')?.setValue(provinceId, { emitEvent: false });
    this.restaurantForm.get('address.city')?.setValue(null, { emitEvent: false });
    this.formListenersActive = true;

    this.toggleAddressFields(false);
  }

  onDropdownCityChange(cityId: string | null): void {
    this.currentCityId = cityId;

    this.formListenersActive = false;
    this.restaurantForm.get('address.city')?.setValue(cityId, { emitEvent: false });
    this.formListenersActive = true;

    this.toggleAddressFields(!!cityId);
  }

  onCityDetailsSelected(municipality: GeorefMunicipality | null): void {
    this.currentMunicipalityDetails = municipality;
    if (municipality && municipality.centroide && this.locationPicker) {
      const currentZoom = this.locationPicker?.map?.getZoom() || 15;
      this.locationPicker.setMapCenterAndMarker(municipality.centroide.lat, municipality.centroide.lon, currentZoom);
    } else {
      this.formListenersActive = false;
      this.restaurantForm.get('address.latitude')?.setValue(null, { emitEvent: false });
      this.restaurantForm.get('address.longitude')?.setValue(null, { emitEvent: false });
      this.formListenersActive = true;
      this.toggleAddressFields(false);
    }
  }

  onProvincesLoaded(provinces: GeorefProvince[]): void {
    this.allProvinces = provinces;
  }

  private toggleAddressFields(enable: boolean): void {
    const streetControl = this.restaurantForm.get('address.street');
    const numberControl = this.restaurantForm.get('address.number');
    if (enable) {
      streetControl?.enable({ emitEvent: false });
      numberControl?.enable({ emitEvent: false });
    } else {
      streetControl?.disable({ emitEvent: false });
      numberControl?.disable({ emitEvent: false });
    }
  }

  async onLocationSelected(event: LocationSelectedEvent): Promise<void> {
    this.formListenersActive = false;

    this.restaurantForm.patchValue({
      address: {
        latitude: event.lat,
        longitude: event.lng
      }
    }, { emitEvent: false });

    if (!event.fullGeorefResponse) {
      this.clearAddressFields();
      await this.locationDropdowns.setDropdownValues(null, null, false);
      this.currentProvinceId = null;
      this.currentCityId = null;
      this.currentMunicipalityDetails = null;
      this.toggleAddressFields(false);
      this.formListenersActive = true;
      this.restaurantForm.updateValueAndValidity();
      return;
    }

    this.isLoading = true;

    try {
      const direcciones: GeorefDireccion[] = await firstValueFrom(
        this.georefService.getDireccionPorCoordenadas(event.lat, event.lng).pipe(
          catchError(error => {
            this.handleError('No se pudo obtener la dirección completa para esta ubicación desde el mapa.', error);
            this.clearAddressFields();
            this.locationDropdowns.setDropdownValues(null, null, false);
            this.currentProvinceId = null;
            this.currentCityId = null;
            this.currentMunicipalityDetails = null;
            this.toggleAddressFields(false);
            return of([]);
          })
        )
      );

      this.isLoading = false;
      if (!direcciones || direcciones.length === 0) {
        this.errorMessage = 'No se encontraron detalles de dirección para las coordenadas seleccionadas.';
        this.clearAddressFields();
        await this.locationDropdowns.setDropdownValues(null, null, false);
        this.currentProvinceId = null;
        this.currentCityId = null;
        this.currentMunicipalityDetails = null;
        this.toggleAddressFields(false);
        this.formListenersActive = true;
        this.restaurantForm.updateValueAndValidity();
        return;
      }

      const georefDireccion = direcciones[0];

      let provinceIdToSet: string | null = null;
      let municipalityIdToSet: string | null = null;
      let matchedMunicipalityObj: GeorefMunicipality | undefined;

      if (georefDireccion.provincia?.id) {
        const matchedProvinceById = this.allProvinces.find(p => p.id === georefDireccion.provincia?.id);
        if (matchedProvinceById) {
          provinceIdToSet = matchedProvinceById.id;
        }
      }
      if (!provinceIdToSet && georefDireccion.provincia?.nombre) {
        const cleanedGeoRefProvinceName = this.cleanName(georefDireccion.provincia.nombre, 'province');
        const matchedProvinceByName = this.allProvinces.find(
          p => this.cleanName(p.nombre, 'province')?.toLowerCase() === cleanedGeoRefProvinceName?.toLowerCase()
        );
        if (matchedProvinceByName) {
          provinceIdToSet = matchedProvinceByName.id;
        }
      }

      if (!provinceIdToSet) {
          this.clearAddressFields();
          await this.locationDropdowns.setDropdownValues(null, null, false);
          this.currentProvinceId = null;
          this.currentCityId = null;
          this.currentMunicipalityDetails = null;
          this.toggleAddressFields(false);
          this.formListenersActive = true;
          this.restaurantForm.updateValueAndValidity();
          return;
      }

      const municipalitiesForProvince = await firstValueFrom(this.georefService.getMunicipalitiesByProvinceId(provinceIdToSet).pipe(
          catchError(error => {
              this.handleError('Error al cargar municipios para la provincia obtenida de GeoRef.', error);
              return of([]);
          })
      ));

      let potentialNamesFromGeoRef: string[] = [];

      if (georefDireccion.municipio?.nombre) {
        potentialNamesFromGeoRef.push(georefDireccion.municipio.nombre);
      }
      if (georefDireccion.localidad?.nombre) {
        potentialNamesFromGeoRef.push(georefDireccion.localidad.nombre);
      }
      if (georefDireccion.localidad_censal?.nombre) {
          potentialNamesFromGeoRef.push(georefDireccion.localidad_censal.nombre);
      }

      const fullAddress = georefDireccion.nombre_completo || '';

      const regexMatchPrimaryCity = /^(?:[^,]+,\s*)*(?:Ciudad de\s*)?([^,]+?)(?:,\s*(?:Departamento|Partido|Pedanía|Barrio|Comuna|Localidad Censal|Provincia de))?/i;
      const primaryCityMatch = fullAddress.match(regexMatchPrimaryCity);

      if (primaryCityMatch && primaryCityMatch[1]) {
          const extractedPrimaryCity = primaryCityMatch[1].trim();
          if (this.cleanName(extractedPrimaryCity, 'city') !== this.cleanName(georefDireccion.provincia?.nombre, 'province')) {
              potentialNamesFromGeoRef.push(extractedPrimaryCity);
          }
      }

      const municipalityMatchFromFull = fullAddress.match(/Municipio de ([^,]+)/i);
      if (municipalityMatchFromFull && municipalityMatchFromFull[1]) {
          potentialNamesFromGeoRef.push(municipalityMatchFromFull[1].trim());
      }

      potentialNamesFromGeoRef = Array.from(new Set(potentialNamesFromGeoRef.filter(name => name && name.trim() !== '')));

      if (georefDireccion.municipio?.id) {
          matchedMunicipalityObj = municipalitiesForProvince.find(m => m.id === georefDireccion.municipio?.id);
      }

      if (!matchedMunicipalityObj) {
        for (const nameRaw of potentialNamesFromGeoRef) {
            const searchNameCleaned = this.cleanName(nameRaw, 'city');
            if (searchNameCleaned) {
                matchedMunicipalityObj = municipalitiesForProvince.find(
                    m => {
                        const cleanedMuniName = this.cleanName(m.nombre, 'city');
                        return cleanedMuniName?.toLowerCase() === searchNameCleaned.toLowerCase();
                    }
                );
                if (matchedMunicipalityObj) {
                    break;
                }
            }
        }
      }

      const selectedProvinceGeoRef = this.allProvinces.find(p => p.id === provinceIdToSet);
      const cleanedProvinceName = this.cleanName(selectedProvinceGeoRef?.nombre, 'province');

      if (!matchedMunicipalityObj && selectedProvinceGeoRef?.nombre) {
          const capitalMunicipality = municipalitiesForProvince.find(
              m => this.cleanName(m.nombre, 'city')?.toLowerCase() === 'capital' ||
                   this.cleanName(m.nombre, 'city')?.toLowerCase() === cleanedProvinceName ||
                   this.cleanName(m.nombre, 'city')?.toLowerCase() === `ciudad de ${cleanedProvinceName}` ||
                   (cleanedProvinceName === 'santiago del estero' && this.cleanName(m.nombre, 'city') === 'santiago del estero')
          );
          if (capitalMunicipality) {
              matchedMunicipalityObj = capitalMunicipality;
          }
      }

      if (!matchedMunicipalityObj) {
        for (const nameRaw of potentialNamesFromGeoRef) {
            const searchNameCleaned = this.cleanName(nameRaw, 'city');
            if (searchNameCleaned) {
                matchedMunicipalityObj = municipalitiesForProvince.find(m => {
                    const cleanedMuniName = this.cleanName(m.nombre, 'city');
                    return cleanedMuniName && cleanedMuniName.includes(searchNameCleaned);
                });
                if (matchedMunicipalityObj) {
                    break;
                }
            }
        }
      }

      if (matchedMunicipalityObj) {
        municipalityIdToSet = matchedMunicipalityObj.id;
      } else {
        municipalityIdToSet = null;
      }

      await this.locationDropdowns.setDropdownValues(provinceIdToSet, municipalityIdToSet, true);

      this.restaurantForm.patchValue({
        address: {
          street: georefDireccion.calle?.nombre || '',
          number: georefDireccion.altura?.valor !== undefined && georefDireccion.altura.valor !== null ? String(georefDireccion.altura.valor) : null,
        }
      }, { emitEvent: false });

      this.toggleAddressFields(!!municipalityIdToSet);

      const currentZoom = this.locationPicker?.map?.getZoom() || 15;

      if (georefDireccion.ubicacion && (georefDireccion.ubicacion.lat !== event.lat || georefDireccion.ubicacion.lon !== event.lng)) {
          this.locationPicker.setMapCenterAndMarker(georefDireccion.ubicacion.lat, georefDireccion.ubicacion.lon, currentZoom);
      } else {
          this.locationPicker.setMapCenterAndMarker(event.lat, event.lng, currentZoom);
      }

      this.successMessage = 'Ubicación actualizada desde el mapa.';
      this.formListenersActive = true;
      this.restaurantForm.updateValueAndValidity();
    } catch (err: any) {
      this.handleError('Error en la obtención de dirección inversa desde GeoRef', err);
      this.clearAddressFields();
      await this.locationDropdowns.setDropdownValues(null, null, false);
      this.currentProvinceId = null;
      this.currentCityId = null;
      this.currentMunicipalityDetails = null;
      this.toggleAddressFields(false);
      this.formListenersActive = true;
      this.restaurantForm.updateValueAndValidity();
    }
  }

  private geocodeManualAddress(): void {
    const { street, number } = this.restaurantForm.get('address')?.getRawValue();

    const selectedProvince = this.allProvinces.find(p => p.id === this.currentProvinceId);
    let selectedMunicipality = this.currentMunicipalityDetails;
    if (!selectedMunicipality && this.currentCityId && this.locationDropdowns.municipalities.length > 0) {
        selectedMunicipality = this.locationDropdowns.municipalities.find(m => m.id === this.currentCityId) || null;
    }

    if (street && number && selectedProvince && selectedMunicipality && this.formListenersActive && this.locationPicker) {
      this.isLoading = true;

      const selectedProvinceName = selectedProvince.nombre;
      const selectedMunicipalityName = selectedMunicipality.nombre;

      this.subscriptions.add(
        this.georefService.buscarDireccion(street, number, selectedProvinceName, selectedMunicipalityName).pipe(
          catchError(error => {
            this.errorMessage = 'Error al buscar la dirección en el mapa.';
            this.isLoading = false;
            return of([]);
          })
        ).subscribe((direcciones: GeorefDireccion[] | null) => {
          this.isLoading = false;
          if (direcciones && direcciones.length > 0) {
            const primeraDireccion = direcciones[0];
            const lat = primeraDireccion.ubicacion?.lat;
            const lon = primeraDireccion.ubicacion?.lon;

            if (lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
              this.formListenersActive = false;
              if (this.restaurantForm.get('address.latitude')?.value !== lat || this.restaurantForm.get('address.longitude')?.value !== lon) {
                this.restaurantForm.get('address.latitude')?.setValue(lat, { emitEvent: false });
                this.restaurantForm.get('address.longitude')?.setValue(lon, { emitEvent: false });
              }
              this.formListenersActive = true;
              const currentZoom = this.locationPicker?.map?.getZoom() || 15;
              this.locationPicker.setMapCenterAndMarker(lat, lon, currentZoom);
              this.successMessage = 'Mapa actualizado con la dirección del formulario.';
            } else {
              this.errorMessage = 'Dirección encontrada pero sin coordenadas válidas.';
            }
          } else {
            this.errorMessage = 'No se encontró una dirección precisa para los datos ingresados.';
          }
        })
      );
    }
  }

  private resetDependentFields(fields: ('province' | 'city')[]): void {
    this.formListenersActive = false;
    fields.forEach(field => {
      const control = this.restaurantForm.get(`address.${field}`);
      if (control) {
        control.reset(null, { emitEvent: false });
      }
      if (field === 'city') {
        this.restaurantForm.get('address.latitude')?.reset(null, { emitEvent: false });
        this.restaurantForm.get('address.longitude')?.reset(null, { emitEvent: false });
      }
    });
    this.formListenersActive = true;
  }

  onSubmit(): void {
    this.errorMessage = null;
    this.successMessage = null;

    if (this.restaurantForm.invalid || !this.currentProvinceId || !this.currentCityId) {
      this.errorMessage = 'Por favor complete todos los campos obligatorios correctamente, incluyendo la ubicación.';
      this.markFormGroupTouched(this.restaurantForm);
      return;
    }

    const formValue = this.restaurantForm.getRawValue() as RestaurantFormValue;

    const selectedProvince = this.allProvinces.find(p => p.id === this.currentProvinceId);
    const selectedMunicipality = this.currentMunicipalityDetails;

    if (!selectedProvince || !selectedMunicipality ||
      formValue.address.latitude === null || formValue.address.longitude === null) {
      this.errorMessage = 'Error en la selección de ubicación o coordenadas. Por favor, asegúrese de que la dirección está completa y las coordenadas están en el mapa.';
      return;
    }

    this.isLoading = true;

    const payload: CreateRestaurantPayloadForService = {
      name: formValue.name,
      imageUrl: formValue.imageUrl,
      description: formValue.description || '',
      address: {
        street: formValue.address.street,
        number: formValue.address.number,
        cityId: Number(selectedMunicipality.id),
        city: selectedMunicipality.nombre,
        location: {
          lat: formValue.address.latitude,
          lng: formValue.address.longitude
        }
      },
    };

    const operation = this.isEditMode && this.restaurantId ?
      this.restaurantService.update(this.restaurantId, payload) :
      this.restaurantService.create(payload);

    this.subscriptions.add(
      operation.subscribe({
        next: () => {
          this.handleSuccess();
        },
        error: (err: any) => {
          this.handleError(`Error al ${this.isEditMode ? 'actualizar' : 'crear'} el restaurante`, err);
        }
      })
    );
  }

  private handleSuccess(): void {
    this.isLoading = false;
    this.successMessage = `Restaurante ${this.isEditMode ? 'actualizado' : 'creado'} correctamente!`;
    setTimeout(() => {
      this.router.navigate(['/my-restaurants']);
    }, 1500);
  }

  private handleError(message: string, error: any): void {
    this.isLoading = false;
    this.errorMessage = message;
    if (error) {
      this.errorMessage += `: ${error.error?.message || error.message || 'Error del servidor'}`;
    }
  }

  onCancel(): void {
    if (this.restaurantForm.dirty) {
      if (confirm('¿Está seguro que desea cancelar? Los cambios no guardados se perderán.')) {
        this.router.navigate(['/my-restaurants']);
      }
    } else {
      this.router.navigate(['/my-restaurants']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }

  private clearAddressFields(): void {
    this.restaurantForm.patchValue({
      address: {
        street: '',
        number: null,
        latitude: null,
        longitude: null,
      }
    }, { emitEvent: false });
  }

  private async clearLocationDropdowns(level: ('province' | 'city' | 'all')): Promise<void> {
    this.formListenersActive = false;
    if (level === 'all' || level === 'province') {
      await this.locationDropdowns.setDropdownValues(null, null, false);
    } else if (level === 'city' && this.locationDropdowns.selectedProvinceId) {
      await this.locationDropdowns.setDropdownValues(this.locationDropdowns.selectedProvinceId, null, false);
    } else if (level === 'city') {
        await this.locationDropdowns.setDropdownValues(null, null, false);
    }
    this.currentProvinceId = this.locationDropdowns.selectedProvinceId;
    this.currentCityId = this.locationDropdowns.selectedCityId;
    this.currentMunicipalityDetails = null;
    this.formListenersActive = true;
    this.restaurantForm.updateValueAndValidity();
  }

  private async loadRestaurantData(id: number): Promise<void> {
    this.isLoading = true;
    try {
        const restaurant = await firstValueFrom(this.restaurantService.getById(id));
        this.formListenersActive = false;

        const cityIdFromDb = String(restaurant.address.cityId);
        let foundMunicipality: GeorefMunicipality | undefined;
        let foundProvinceId: string | null = null;

        const provinceFromDb = this.allProvinces.find(p =>
            this.cleanName(p.nombre, 'province')?.toLowerCase() === this.cleanName(restaurant.address.province, 'province')?.toLowerCase()
        );

        if (provinceFromDb) {
            foundProvinceId = provinceFromDb.id;
            const municipalitiesForProvince = await firstValueFrom(this.georefService.getMunicipalitiesByProvinceId(provinceFromDb.id));
            foundMunicipality = municipalitiesForProvince.find(m => m.id === cityIdFromDb);

            if (!foundMunicipality) {
                const cleanedCityName = this.cleanName(restaurant.address.city, 'city');
                foundMunicipality = municipalitiesForProvince.find(
                    m => this.cleanName(m.nombre, 'city')?.toLowerCase() === cleanedCityName?.toLowerCase()
                );
            }
            if (!foundMunicipality && this.cleanName(restaurant.address.city, 'city') === this.cleanName(restaurant.address.province, 'province')) {
                foundMunicipality = municipalitiesForProvince.find(
                    m => this.cleanName(m.nombre, 'city')?.toLowerCase() === 'capital' ||
                         this.cleanName(m.nombre, 'city')?.toLowerCase() === this.cleanName(provinceFromDb.nombre, 'province')
                );
            }
        }

        await this.locationDropdowns.setDropdownValues(foundProvinceId, foundMunicipality ? foundMunicipality.id : null, false);

        this.currentProvinceId = this.locationDropdowns.selectedProvinceId;
        this.currentCityId = this.locationDropdowns.selectedCityId;
        this.currentMunicipalityDetails = foundMunicipality || null;

        this.restaurantForm.patchValue({
            name: restaurant.name,
            imageUrl: restaurant.imageUrl,
            description: restaurant.description || '',
            address: {
                street: restaurant.address.street,
                number: restaurant.address.number,
                province: this.currentProvinceId,
                city: this.currentCityId,
                latitude: restaurant.address.location.lat,
                longitude: restaurant.address.location.lng
            }
        }, { emitEvent: false });

        this.toggleAddressFields(true);

        if (this.locationPicker && restaurant.address.location.lat && restaurant.address.location.lng) {
            setTimeout(() => {
                this.locationPicker.setMapCenterAndMarker(restaurant.address.location.lat, restaurant.address.location.lng, 16);
                this.formListenersActive = true;
                this.restaurantForm.updateValueAndValidity();
            }, 0);
        } else {
            this.formListenersActive = true;
            this.restaurantForm.updateValueAndValidity();
        }
        this.isLoading = false;
    } catch (err: any) {
        this.handleError('Error al cargar los datos del restaurante para edición', err);
        this.isLoading = false;
        this.formListenersActive = true;
    }
  }
}